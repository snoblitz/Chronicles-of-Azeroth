// ============================================================================
// Character bible storage — Phase 0 uses localStorage with a versioned envelope.
// Phase 1 will swap the backend to SQLite; the public API here should stay stable.
//
// Storage layout (multi-character roster, v2):
//   at.bible.roster.v1     -> { activeKey: string | null, keys: string[] }
//   at.bible.entry.<key>   -> BibleEnvelope (one per saved hero)
//
// Where <key> is the bible's createdAt timestamp as a string. This matches the
// `characterKey` used by npcChatStore so NPC threads stay bound to the right hero.
//
// Migration: a legacy `at.bible.current` key (the old single-bible slot) is
// detected on every load and migrated into the roster on the fly.
// ============================================================================

import type { BibleEnvelope, CharacterBible, HistoryEntry } from '../types';

const LEGACY_KEY = 'at.bible.current';
const ROSTER_KEY = 'at.bible.roster.v1';
const ENTRY_PREFIX = 'at.bible.entry.';
const SCHEMA_VERSION = 1;

const VALID_FACTIONS = ['Alliance', 'Horde'] as const;

interface RosterIndex {
  activeKey: string | null;
  keys: string[];
}

export interface BibleRosterEntry {
  key: string;
  name: string;
  race: string;
  class: string;
  faction: string;
  updatedAt: number;
  isActive: boolean;
}

/**
 * Type guard for `CharacterBible`. Returns true only if the shape matches
 * what the rest of the app expects. We deliberately don't try to repair
 * malformed bibles here — that's the caller's job.
 */
export function validateBible(x: unknown): x is CharacterBible {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim()) return false;
  if (typeof b.race !== 'string' || !b.race.trim()) return false;
  if (typeof b.class !== 'string' || !b.class.trim()) return false;
  if (typeof b.faction !== 'string' || !(VALID_FACTIONS as readonly string[]).includes(b.faction)) return false;
  if (b.age !== undefined && typeof b.age !== 'number') return false;
  if (b.homeland !== undefined && typeof b.homeland !== 'string') return false;
  if (typeof b.backstory !== 'string' || !b.backstory.trim()) return false;
  if (!Array.isArray(b.beliefs) || !b.beliefs.every((v) => typeof v === 'string')) return false;
  if (!Array.isArray(b.motivations) || !b.motivations.every((v) => typeof v === 'string')) return false;
  if (b.fears !== undefined && (!Array.isArray(b.fears) || !b.fears.every((v) => typeof v === 'string'))) return false;
  if (b.flaws !== undefined && (!Array.isArray(b.flaws) || !b.flaws.every((v) => typeof v === 'string'))) return false;
  if (b.coreQuote !== undefined && typeof b.coreQuote !== 'string') return false;
  if (b.level !== undefined && (typeof b.level !== 'number' || !Number.isFinite(b.level))) return false;
  if (b.currentZone !== undefined && typeof b.currentZone !== 'string') return false;
  if (b.history !== undefined) {
    if (!Array.isArray(b.history)) return false;
    for (const entry of b.history) {
      if (!entry || typeof entry !== 'object') return false;
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== 'string' || !e.id.trim()) return false;
      if (typeof e.timestamp !== 'number') return false;
      if (typeof e.text !== 'string') return false;
      if (e.zone !== undefined && typeof e.zone !== 'string') return false;
      if (e.level !== undefined && typeof e.level !== 'number') return false;
    }
  }
  if (typeof b.voice !== 'string' || !b.voice.trim()) return false;
  if (typeof b.createdAt !== 'number' || typeof b.updatedAt !== 'number') return false;
  return true;
}

/**
 * Return a list of human-readable errors describing why a candidate bible
 * doesn't validate. Useful for the LLM repair prompt and the manual editor.
 */
export function bibleValidationErrors(x: unknown): string[] {
  const errors: string[] = [];
  if (!x || typeof x !== 'object') {
    return ['top-level value is not an object'];
  }
  const b = x as Record<string, unknown>;
  const requireString = (field: string) => {
    if (typeof b[field] !== 'string' || !(b[field] as string).trim()) {
      errors.push(`"${field}" must be a non-empty string`);
    }
  };
  const requireStringArray = (field: string) => {
    if (!Array.isArray(b[field]) || !(b[field] as unknown[]).every((v) => typeof v === 'string')) {
      errors.push(`"${field}" must be an array of strings`);
    }
  };
  requireString('name');
  requireString('race');
  requireString('class');
  if (typeof b.faction !== 'string' || !(VALID_FACTIONS as readonly string[]).includes(b.faction)) {
    errors.push(`"faction" must be one of: ${VALID_FACTIONS.join(', ')}`);
  }
  if (b.age !== undefined && typeof b.age !== 'number') errors.push('"age" must be a number if present');
  if (b.homeland !== undefined && typeof b.homeland !== 'string') errors.push('"homeland" must be a string if present');
  requireString('backstory');
  requireStringArray('beliefs');
  requireStringArray('motivations');
  if (b.fears !== undefined && (!Array.isArray(b.fears) || !(b.fears as unknown[]).every((v) => typeof v === 'string'))) {
    errors.push('"fears" must be an array of strings if present');
  }
  if (b.flaws !== undefined && (!Array.isArray(b.flaws) || !(b.flaws as unknown[]).every((v) => typeof v === 'string'))) {
    errors.push('"flaws" must be an array of strings if present');
  }
  if (b.coreQuote !== undefined && typeof b.coreQuote !== 'string') {
    errors.push('"coreQuote" must be a string if present');
  }
  if (b.level !== undefined && (typeof b.level !== 'number' || !Number.isFinite(b.level))) {
    errors.push('"level" must be a finite number if present');
  }
  if (b.currentZone !== undefined && typeof b.currentZone !== 'string') {
    errors.push('"currentZone" must be a string if present');
  }
  if (b.history !== undefined && !Array.isArray(b.history)) {
    errors.push('"history" must be an array if present');
  }
  requireString('voice');
  return errors;
}

// ---------------------------------------------------------------------------
// internal: roster + entry helpers
// ---------------------------------------------------------------------------

function entryStorageKey(key: string): string {
  return `${ENTRY_PREFIX}${key}`;
}

function readRoster(): RosterIndex {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return { activeKey: null, keys: [] };
    const parsed = JSON.parse(raw) as Partial<RosterIndex>;
    if (!parsed || typeof parsed !== 'object') return { activeKey: null, keys: [] };
    const keys = Array.isArray(parsed.keys) ? parsed.keys.filter((k): k is string => typeof k === 'string') : [];
    const activeKey = typeof parsed.activeKey === 'string' && keys.includes(parsed.activeKey)
      ? parsed.activeKey
      : null;
    return { activeKey, keys };
  } catch (err) {
    console.warn('[bibleStore] failed to read roster:', err);
    return { activeKey: null, keys: [] };
  }
}

function writeRoster(roster: RosterIndex): void {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
}

function readEntry(key: string): CharacterBible | null {
  try {
    const raw = localStorage.getItem(entryStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BibleEnvelope>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      console.warn(`[bibleStore] entry ${key}: schemaVersion mismatch`);
      return null;
    }
    if (!validateBible(parsed.bible)) {
      console.warn(`[bibleStore] entry ${key}: failed validation`);
      return null;
    }
    return parsed.bible;
  } catch (err) {
    console.warn(`[bibleStore] failed to read entry ${key}:`, err);
    return null;
  }
}

function writeEntry(bible: CharacterBible): void {
  const envelope: BibleEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: Date.now(),
    bible,
  };
  localStorage.setItem(entryStorageKey(bibleKey(bible)), JSON.stringify(envelope));
}

function bibleKey(bible: Pick<CharacterBible, 'createdAt'>): string {
  return String(bible.createdAt);
}

/**
 * One-shot migration of the legacy single-bible slot into the roster. Safe to
 * call repeatedly: if the legacy slot is gone or the entry already exists in
 * the roster, this is a no-op.
 */
function migrateLegacyIfPresent(): void {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const parsed = JSON.parse(legacyRaw) as Partial<BibleEnvelope>;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !validateBible(parsed.bible)) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const key = bibleKey(parsed.bible);
    const roster = readRoster();
    if (!roster.keys.includes(key)) {
      writeEntry(parsed.bible);
      roster.keys.push(key);
    }
    if (!roster.activeKey) {
      roster.activeKey = key;
    }
    writeRoster(roster);
    localStorage.removeItem(LEGACY_KEY);
    console.info('[bibleStore] migrated legacy bible into roster');
  } catch (err) {
    console.warn('[bibleStore] legacy migration failed:', err);
  }
}

function fireBibleUpdated(bible: CharacterBible | null): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('at:bible-updated', { detail: bible }));
  }
}

// ---------------------------------------------------------------------------
// one-time backfill: add fears/flaws/coreQuote to seed characters created
// before those fields existed. Identified by createdAt (stable per bible).
// Runs at most once thanks to the localStorage flag.
// ---------------------------------------------------------------------------

const BACKFILL_FLAG = 'at.migrations.fears-flaws-quote.v1';

interface BibleBackfill {
  createdAt: number;
  name: string;
  fears: string[];
  flaws: string[];
  coreQuote: string;
}

const SEED_BACKFILLS: BibleBackfill[] = [
  {
    createdAt: 1779645176311,
    name: 'Magnus Brunn',
    fears: [
      "Becoming only a weapon in another leader's hand.",
      'Mistaking obedience for honor.',
      'Failing to protect the vulnerable because he acted too slowly or too late.',
      'Teaching younger warriors the wrong lesson through his own choices.',
    ],
    flaws: [
      'Can be slow to trust commanders or simple battle plans.',
      'Carries guilt for harm he did not directly cause but still feels responsible for.',
      'May hesitate when a situation morally resembles past mistakes.',
      'Can come across as grim or judgmental to warriors who still value glory.',
    ],
    coreQuote: 'Magnus Brunn held the line, but never forgot why the line mattered.',
  },
];

function applySeedBackfills(): void {
  try {
    if (localStorage.getItem(BACKFILL_FLAG)) return;
    const roster = readRoster();
    let patched = 0;
    for (const seed of SEED_BACKFILLS) {
      for (const key of roster.keys) {
        const bible = readEntry(key);
        if (!bible) continue;
        if (bible.createdAt !== seed.createdAt || bible.name !== seed.name) continue;
        const needsFears = !Array.isArray(bible.fears) || bible.fears.length === 0;
        const needsFlaws = !Array.isArray(bible.flaws) || bible.flaws.length === 0;
        const needsQuote = typeof bible.coreQuote !== 'string' || !bible.coreQuote.trim();
        if (!needsFears && !needsFlaws && !needsQuote) continue;
        const updated: CharacterBible = {
          ...bible,
          fears: needsFears ? seed.fears : bible.fears,
          flaws: needsFlaws ? seed.flaws : bible.flaws,
          coreQuote: needsQuote ? seed.coreQuote : bible.coreQuote,
          updatedAt: Date.now(),
        };
        writeEntry(updated);
        patched++;
      }
    }
    localStorage.setItem(BACKFILL_FLAG, String(Date.now()));
    if (patched > 0) {
      console.info(`[bibleStore] backfilled fears/flaws/coreQuote on ${patched} seed bible(s)`);
    }
  } catch (err) {
    console.warn('[bibleStore] seed backfill failed:', err);
  }
}

// ---------------------------------------------------------------------------
// public API — single-active-bible (existing surface, preserved)
// ---------------------------------------------------------------------------

export function loadBible(): CharacterBible | null {
  migrateLegacyIfPresent();
  applySeedBackfills();
  const roster = readRoster();
  if (!roster.activeKey) return null;
  return readEntry(roster.activeKey);
}

export function saveBible(bible: CharacterBible): BibleEnvelope {
  migrateLegacyIfPresent();
  writeEntry(bible);
  const key = bibleKey(bible);
  const roster = readRoster();
  if (!roster.keys.includes(key)) roster.keys.push(key);
  roster.activeKey = key;
  writeRoster(roster);
  fireBibleUpdated(bible);
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: Date.now(),
    bible,
  };
}

/**
 * Non-destructive: clears the active pointer so the UI falls back to the
 * creation interview, but keeps the bible in the roster so it can be reopened
 * from the character selector. Use `deleteBible` for permanent removal.
 */
export function clearBible(): void {
  migrateLegacyIfPresent();
  const roster = readRoster();
  if (roster.activeKey === null) return;
  roster.activeKey = null;
  writeRoster(roster);
  fireBibleUpdated(null);
}

// ---------------------------------------------------------------------------
// public API — multi-character roster
// ---------------------------------------------------------------------------

export function listBibles(): BibleRosterEntry[] {
  migrateLegacyIfPresent();
  const roster = readRoster();
  const entries: BibleRosterEntry[] = [];
  for (const key of roster.keys) {
    const bible = readEntry(key);
    if (!bible) continue;
    entries.push({
      key,
      name: bible.name,
      race: bible.race,
      class: bible.class,
      faction: bible.faction,
      updatedAt: bible.updatedAt,
      isActive: key === roster.activeKey,
    });
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries;
}

export function setActiveBible(key: string): CharacterBible | null {
  migrateLegacyIfPresent();
  const bible = readEntry(key);
  if (!bible) return null;
  const roster = readRoster();
  if (!roster.keys.includes(key)) roster.keys.push(key);
  roster.activeKey = key;
  writeRoster(roster);
  fireBibleUpdated(bible);
  return bible;
}

export function deleteBible(key: string): void {
  migrateLegacyIfPresent();
  const roster = readRoster();
  const idx = roster.keys.indexOf(key);
  if (idx === -1) return;
  roster.keys.splice(idx, 1);
  const wasActive = roster.activeKey === key;
  if (wasActive) roster.activeKey = null;
  writeRoster(roster);
  localStorage.removeItem(entryStorageKey(key));
  // Also sweep any NPC threads bound to this hero.
  try {
    const npcPrefix = `at.npc.v1.${key}.`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(npcPrefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('[bibleStore] failed to sweep NPC threads for', key, err);
  }
  if (wasActive) fireBibleUpdated(null);
}

/**
 * Plant a preset character into the roster. If a bible with the same key
 * already exists we just re-activate it — we never overwrite user edits.
 * Returns the bible that's now active (preset's or the existing one).
 */
export function loadPresetCharacter(preset: CharacterBible): CharacterBible {
  migrateLegacyIfPresent();
  const key = bibleKey(preset);
  const existing = readEntry(key);
  if (existing) {
    setActiveBible(key);
    return existing;
  }
  saveBible(preset);
  return preset;
}

// ---------------------------------------------------------------------------
// public API — in-place mutations on the active bible
// ---------------------------------------------------------------------------

/**
 * Atomically patch the active bible with a partial update, bumping
 * updatedAt and firing the bible-updated event. Returns the new bible
 * or null if there is no active bible.
 */
export function updateActiveBible(
  patch: Partial<CharacterBible>,
): CharacterBible | null {
  const current = loadBible();
  if (!current) return null;
  const updated: CharacterBible = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  writeEntry(updated);
  fireBibleUpdated(updated);
  return updated;
}

/**
 * Append a single history entry to the active bible, snapshotting the
 * hero's current level + zone into the entry. Returns the new entry,
 * or null if there is no active bible.
 */
export function appendHistoryEntry(text: string): HistoryEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const current = loadBible();
  if (!current) return null;
  const entry: HistoryEntry = {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    text: trimmed,
    zone: current.currentZone,
    level: current.level,
  };
  const history = [...(current.history ?? []), entry];
  updateActiveBible({ history });
  return entry;
}

/**
 * Remove a single history entry by id from the active bible.
 */
export function deleteHistoryEntry(id: string): void {
  const current = loadBible();
  if (!current || !Array.isArray(current.history)) return;
  const next = current.history.filter((e) => e.id !== id);
  if (next.length === current.history.length) return;
  updateActiveBible({ history: next });
}

