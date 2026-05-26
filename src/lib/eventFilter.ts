// Per-event-type filter for the CompanionExport enrich panel.
//
// Real SV files contain a long tail of low-signal events
// (UNIT_QUEST_LOG_CHANGED, PLAYER_REGEN_*, CHAT_MSG_LOOT/MONEY,
// TIME_PLAYED_MSG) that aren't story-worthy and burn LLM tokens. The
// addon-side `Templates.IsNarrativeEvent` already filters what the
// parchment book will render, so enriching anything outside that set is
// pure waste. On the 580-event stress test 522 of 567 enriched
// paragraphs were never displayed.
//
// This module is the source of truth for the filter on the web side.
// Categorization mirrors the `EVENTS` registry in
// addon/ChroniclesOfAzeroth/ChroniclesOfAzeroth.lua so the UI is
// scannable.

export interface EventCategory {
  id: string;
  label: string;
  events: string[];
}

export const EVENT_CATEGORIES: EventCategory[] = [
  {
    id: 'session',
    label: 'Session lifecycle',
    events: ['PLAYER_LOGIN', 'PLAYER_ENTERING_WORLD', 'PLAYER_LOGOUT'],
  },
  {
    id: 'quest',
    label: 'Quest flow',
    events: [
      'QUEST_DETAIL',
      'QUEST_ACCEPTED',
      'QUEST_PROGRESS',
      'QUEST_COMPLETE',
      'QUEST_TURNED_IN',
      'QUEST_REMOVED',
      'UNIT_QUEST_LOG_CHANGED',
    ],
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    events: ['GOSSIP_SHOW', 'GOSSIP_CLOSED'],
  },
  {
    id: 'world',
    label: 'World state',
    events: ['ZONE_CHANGED', 'ZONE_CHANGED_NEW_AREA', 'ZONE_CHANGED_INDOORS'],
  },
  {
    id: 'character',
    label: 'Character state',
    events: ['PLAYER_LEVEL_UP', 'PLAYER_DEAD', 'PLAYER_ALIVE', 'ACHIEVEMENT_EARNED'],
  },
  {
    id: 'combat',
    label: 'Combat bookends',
    events: ['PLAYER_REGEN_DISABLED', 'PLAYER_REGEN_ENABLED'],
  },
  {
    id: 'loot',
    label: 'Loot & money',
    events: ['LOOT_OPENED', 'CHAT_MSG_LOOT', 'CHAT_MSG_MONEY'],
  },
  {
    id: 'instance',
    label: 'Instance bosses',
    events: ['ENCOUNTER_END', 'BOSS_KILL'],
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    events: ['CHAT_MSG_ADDON', 'TIME_PLAYED_MSG'],
  },
];

// Mirrors addon Templates.IsNarrativeEvent (post 2026-05-26 expansion to
// include ENCOUNTER_END + BOSS_KILL + LOOT_OPENED). These are the events
// the parchment book actually renders. LOOT_OPENED additionally goes
// through a quality gate (lootMinQuality) — entries with no items at or
// above that threshold are skipped both for enrichment and rendering.
// If you change this list, update IsNarrativeEvent / IsNarrativeEntry in
// Lore/Templates.lua to match.
export const DEFAULT_NARRATIVE_EVENTS: readonly string[] = [
  'QUEST_ACCEPTED',
  'QUEST_TURNED_IN',
  'PLAYER_LEVEL_UP',
  'ZONE_CHANGED_NEW_AREA',
  'PLAYER_DEAD',
  'ACHIEVEMENT_EARNED',
  'ENCOUNTER_END',
  'BOSS_KILL',
  'LOOT_OPENED',
];

// WoW item quality enum. Defaults to Uncommon — the trash floor where
// items typically have flavorful names instead of "Linen Cloth ×3".
export const LOOT_QUALITY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Poor+ (everything)' },
  { value: 1, label: 'Common+' },
  { value: 2, label: 'Uncommon+' },
  { value: 3, label: 'Rare+' },
  { value: 4, label: 'Epic+' },
  { value: 5, label: 'Legendary+' },
];

export const DEFAULT_LOOT_MIN_QUALITY = 2;

const STORAGE_KEY = 'at.enrichFilter.v1';

interface PersistedFilter {
  enabled: string[];
  lootMinQuality?: number;
}

export interface EventFilter {
  enabled: Set<string>;
  lootMinQuality: number;
}

// Known events declared in EVENT_CATEGORIES; used to validate persisted
// values when loading from localStorage.
const KNOWN_EVENTS = new Set<string>(
  EVENT_CATEGORIES.flatMap((c) => c.events),
);

export function defaultEventFilter(): EventFilter {
  return {
    enabled: new Set(DEFAULT_NARRATIVE_EVENTS),
    lootMinQuality: DEFAULT_LOOT_MIN_QUALITY,
  };
}

export function loadEventFilter(): EventFilter {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEventFilter();
    const parsed = JSON.parse(raw) as PersistedFilter | string[] | unknown;
    // Backward-compat: v0 of the format persisted a plain string[].
    if (Array.isArray(parsed)) {
      const validated = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
      return {
        enabled: new Set(validated),
        lootMinQuality: DEFAULT_LOOT_MIN_QUALITY,
      };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as PersistedFilter;
      const enabled = Array.isArray(obj.enabled)
        ? obj.enabled.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];
      const minQ =
        typeof obj.lootMinQuality === 'number' && obj.lootMinQuality >= 0 && obj.lootMinQuality <= 7
          ? Math.floor(obj.lootMinQuality)
          : DEFAULT_LOOT_MIN_QUALITY;
      return { enabled: new Set(enabled), lootMinQuality: minQ };
    }
    return defaultEventFilter();
  } catch {
    return defaultEventFilter();
  }
}

export function saveEventFilter(filter: EventFilter): void {
  try {
    if (typeof window === 'undefined') return;
    const payload: PersistedFilter = {
      enabled: [...filter.enabled].sort(),
      lootMinQuality: filter.lootMinQuality,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable (private mode, quota); fail soft.
  }
}

// Returns true if the event should be enriched/rendered under the given
// filter. Centralizes the "narrative event AND (for loot) passes the
// quality gate" decision so the panel counts and the actual enrichment
// queue stay in lockstep.
export function passesFilter(
  event: { wowEvent?: string | null; loot?: { quality?: number }[] },
  filter: EventFilter,
): boolean {
  const name = event.wowEvent ?? '';
  if (!filter.enabled.has(name)) return false;
  if (name === 'LOOT_OPENED') {
    const items = event.loot;
    if (!items || items.length === 0) return false;
    return items.some((i) => typeof i.quality === 'number' && i.quality >= filter.lootMinQuality);
  }
  return true;
}

// Returns the set of event names that appear in `events` but are not
// declared in any category. Useful for surfacing "unknown events" to the
// user so a future addon update isn't silently filtered out.
export function unknownEventTypes(eventNames: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const name of eventNames) {
    if (name && !KNOWN_EVENTS.has(name)) out.add(name);
  }
  return [...out].sort();
}
