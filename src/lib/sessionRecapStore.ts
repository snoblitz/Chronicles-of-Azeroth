// ============================================================================
// Session recap store — localStorage persistence for full-session campfire
// recaps produced at the per-session "the inkwell" panel on each session
// card. Scoped per character so heroes don't bleed recaps into each other.
//
// Why this exists: generating a session recap is real $$ on OpenRouter. Before
// this store, the recap lived only in component state and vaporized on
// refresh. Now it persists, and a parallel chronicle-entry write makes the
// recap a permanent chapter in the Chronicle proper.
// ============================================================================

const STORAGE_PREFIX = 'at.session-recaps.';
export const SESSION_RECAPS_UPDATED_EVENT = 'at:session-recaps-updated';

export interface SessionRecapRecord {
  /** Full LLM output (title + paragraphs + "So what changed" bullets). */
  text: string;
  savedAt: number;
  modelId?: string;
  /** Whether this recap has been committed as a HistoryEntry in the Chronicle. */
  committedAsHistoryEntryId?: string;
}

export type SessionRecapMap = Record<string, SessionRecapRecord>;

function storageKey(characterKey: string): string {
  return `${STORAGE_PREFIX}${characterKey}`;
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_RECAPS_UPDATED_EVENT));
  } catch {
    // SSR / no DOM — silently drop.
  }
}

export function loadSessionRecaps(characterKey: string | null | undefined): SessionRecapMap {
  if (!characterKey) return {};
  try {
    const raw = localStorage.getItem(storageKey(characterKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SessionRecapMap;
  } catch {
    return {};
  }
}

function saveAll(characterKey: string, map: SessionRecapMap): void {
  if (!characterKey) return;
  try {
    localStorage.setItem(storageKey(characterKey), JSON.stringify(map));
    notify();
  } catch {
    // localStorage may be full or disabled — fail soft.
  }
}

export function saveSessionRecap(
  characterKey: string,
  sessionId: string,
  record: SessionRecapRecord,
): void {
  if (!characterKey || !sessionId) return;
  const current = loadSessionRecaps(characterKey);
  current[sessionId] = record;
  saveAll(characterKey, current);
}

export function removeSessionRecap(characterKey: string, sessionId: string): void {
  if (!characterKey || !sessionId) return;
  const current = loadSessionRecaps(characterKey);
  if (!(sessionId in current)) return;
  delete current[sessionId];
  saveAll(characterKey, current);
}

export function clearSessionRecaps(characterKey: string): void {
  if (!characterKey) return;
  try {
    localStorage.removeItem(storageKey(characterKey));
    notify();
  } catch {
    // ignore
  }
}

/**
 * Bulk-overwrite a character's entire recap map. Used by cloud sync to hydrate
 * recaps pulled from the server. Cloud hydration wraps this in a push guard so
 * the resulting event doesn't bounce straight back as an upload.
 */
export function replaceSessionRecaps(characterKey: string, map: SessionRecapMap): void {
  if (!characterKey) return;
  saveAll(characterKey, map);
}
