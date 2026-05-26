// ============================================================================
// Chronicle restore snippet — produces a Lua file that the addon ingests as a
// dedicated SavedVariables channel (ChroniclesOfAzerothRestore). Replaces the
// lossy at-CHRONICLE-V1 blob.
//
// User flow:
//   1. Companion generates the snippet, browser downloads it.
//   2. User quits WoW, drops the file into
//        WTF\Account\<ACCOUNT>\SavedVariables\ChroniclesOfAzerothRestore.lua
//   3. User relaunches WoW. addon/Companion/Restore.lua merges events +
//      enriched paragraphs + bible into ChroniclesOfAzerothDB, then clears
//      the global so the next save wipes the file.
//
// Why a snippet and not a blob:
//   * Carries full event.enrichment (zoneText, questTitle, npc.name,
//     encounterName, loot[]) so the parchment book's resolvers and chapter
//     grouping work. The blob format only carried `EntryID + paragraph`.
//   * Skips the 471 KB EditBox bottleneck — the user drops a file instead
//     of pasting text.
//
// Lua escaping:
//   * Strings use auto-leveled long brackets `[==[...]==]`. We scan each
//     string for `]N=]` patterns and pick a level no level in the content
//     uses, so any content (newlines, quotes, control chars) is safe.
//   * Table keys that look like Lua identifiers go as `k = v`; everything
//     else uses bracketed long-bracket keys: `[ [==[k]==] ] = v`. The
//     spaces between `[` and `[` matter — `[[==[k]==]]` would tokenize as
//     a level-0 long bracket. (Same fix inject-chronicle.ps1 already had.)
// ============================================================================

import type { AddonEvent, LuaValue } from './addonEvents';
import type { ChronicleEnrichment } from './chronicleExport';

export interface BuildChronicleSnippetInput {
  characterName: string;
  characterRealm?: string;
  bible?: string | null;
  events: AddonEvent[];
  enrichments: ChronicleEnrichment[];
  /** Wall-clock for the snippet header. Defaults to `new Date()`. */
  generatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Lua literal emitter
// ---------------------------------------------------------------------------

const LUA_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Pick a long-bracket level (count of `=`) safe for `s`. We must avoid two
 * failure modes:
 *   1. The closer `]<eq>]` appears somewhere inside `s` (Lua would close
 *      early).
 *   2. `s` ends with `]` followed by some number of `=` signs that, when
 *      concatenated with our closer's leading `]<eq>]`, forms the closer
 *      pattern earlier than the actual end. Example: at level 0, content
 *      ending in `]` produces `...]]]` and Lua matches the FIRST `]]`.
 *
 * Implementation: scan the full emission for the closer pattern and bump
 * the level until the only match is at the very end. Honest + correct
 * beats clever.
 */
function pickBracketLevel(s: string): number {
  for (let lvl = 0; lvl < 64; lvl++) {
    const closer = ']' + '='.repeat(lvl) + ']';
    if (s.includes(closer)) continue;
    // Now check the chain-suffix case: simulate the emission and verify
    // the closer's first occurrence in (content + closer) is at the end.
    const joined = s + closer;
    if (joined.indexOf(closer) === s.length) return lvl;
  }
  return 64;
}

/** Emit a Lua long-bracket string literal that's safe for any content. */
export function luaString(s: string): string {
  const lvl = pickBracketLevel(s);
  const eq = '='.repeat(lvl);
  // Long brackets eat a leading newline. Prepend one so the first char of
  // the string is preserved even if it happens to be `\n`.
  const prefix = s.startsWith('\n') ? '\n' : '';
  return `[${eq}[${prefix}${s}]${eq}]`;
}

/** Emit a Lua table key. Identifiers go bare; everything else uses [string]. */
function luaKey(k: string): string {
  if (LUA_IDENT_RE.test(k)) return k;
  // Bracketed key. Spaces between `[` and `[==[` are mandatory.
  return `[ ${luaString(k)} ]`;
}

function isPlainObject(v: unknown): v is { [k: string]: LuaValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True iff `keys` are exactly the integers 1..keys.length. */
function isArrayKeys(obj: { [k: string]: unknown }): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== String(i + 1)) return false;
  }
  return true;
}

/** Recursive Lua literal emitter. `indent` is the current indent in spaces. */
export function luaValue(v: LuaValue | undefined, indent = ''): string {
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'nil';
    // Use enough precision to round-trip floats from GetTime(). Lua reads
    // these as the lua_Number type (double on Retail).
    return Number.isInteger(v) ? String(v) : String(v);
  }
  if (typeof v === 'string') return luaString(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '{}';
    const next = indent + '  ';
    const parts = v.map((entry) => `${next}${luaValue(entry, next)},`);
    return `{\n${parts.join('\n')}\n${indent}}`;
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    const next = indent + '  ';
    // Detect array-shaped maps (e.g. ParsedSavedVariables sometimes hands us
    // `{[1]=..., [2]=...}` as a plain object). Emit them as Lua arrays for
    // round-trip purity.
    if (isArrayKeys(v as { [k: string]: unknown })) {
      const arr = keys.map((k) => v[k] as LuaValue);
      return luaValue(arr, indent);
    }
    // Stable key order so diffs are clean run-to-run.
    keys.sort();
    const parts = keys.map((k) => {
      const child = luaValue(v[k] as LuaValue, next);
      return `${next}${luaKey(k)} = ${child},`;
    });
    return `{\n${parts.join('\n')}\n${indent}}`;
  }
  // Unknown shape — bail to nil rather than crash the export.
  return 'nil';
}

// ---------------------------------------------------------------------------
// Event → SV row reconstruction
// ---------------------------------------------------------------------------

/**
 * Synthesize an enrichment subtable from the AddonEvent's typed fields. Used
 * only when `rawEnrichment` is absent (e.g. simulator-generated events that
 * never lived in SavedVariables). For SV-imported events we ship rawEnrichment
 * verbatim and preserve everything the addon originally captured.
 */
function synthesizeEnrichment(ev: AddonEvent): { [k: string]: LuaValue } {
  const enr: { [k: string]: LuaValue } = {};
  if (ev.zone) enr.zoneText = ev.zone;
  if (ev.subZone) enr.subzoneText = ev.subZone;
  if (typeof ev.playerLevel === 'number') enr.level = ev.playerLevel;
  if (ev.questName) enr.questTitle = ev.questName;
  if (ev.npcName) enr.npc = { name: ev.npcName };
  if (ev.unitName) enr.encounterName = ev.unitName;
  if (ev.loot && ev.loot.length > 0) {
    enr.loot = ev.loot.map((item, i) => {
      const row: { [k: string]: LuaValue } = { slot: i + 1 };
      if (item.name) row.name = item.name;
      if (item.link) row.link = item.link;
      if (typeof item.qty === 'number') row.qty = item.qty;
      if (typeof item.quality === 'number') row.quality = item.quality;
      return row;
    });
  }
  return enr;
}

function eventToSvRow(ev: AddonEvent): { [k: string]: LuaValue } {
  const enrichment = ev.rawEnrichment ?? synthesizeEnrichment(ev);
  const args: LuaValue[] = (ev.rawArgs ?? []).map((a) => a);
  const row: { [k: string]: LuaValue } = {
    id: ev.id,
    event: ev.wowEvent,
    ts: ev.rawTs ?? '',
    args,
  };
  if (typeof ev.rawT === 'number') row.t = ev.rawT;
  if (Object.keys(enrichment).length > 0) row.enrichment = enrichment;
  return row;
}

// ---------------------------------------------------------------------------
// Snippet header — instructions for the user lives at the top of the file
// so they see it the moment they open it in an editor.
// ---------------------------------------------------------------------------

function formatHeader(input: BuildChronicleSnippetInput, generatedAt: Date): string {
  const stamp = generatedAt.toISOString();
  const who = input.characterRealm
    ? `${input.characterName}-${input.characterRealm}`
    : input.characterName;
  return [
    `-- Aftertale -- companion restore snippet`,
    `-- Generated ${stamp} for character "${who}".`,
    `--`,
    `-- HOW TO USE:`,
    `--   1. Quit WoW completely (full client exit, not just /reload).`,
    `--   2. Copy this file to:`,
    `--        WTF\\Account\\<YOUR_ACCOUNT>\\SavedVariables\\ChroniclesOfAzerothRestore.lua`,
    `--      OVERWRITING any existing file with that name.`,
    `--   3. Launch WoW. On load, the Chronicles addon detects the restore`,
    `--      payload, merges events + enriched paragraphs + bible into`,
    `--      ChroniclesOfAzerothDB, then clears the restore global so it`,
    `--      cannot re-apply. A one-line confirmation prints to chat.`,
    `--`,
    `-- Safe to re-download: re-running the merge with the same payload is a`,
    `-- no-op (events dedupe by id; enriched paragraphs overwrite same key).`,
    ``,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildChronicleSnippet(input: BuildChronicleSnippetInput): string {
  const generatedAt = input.generatedAt ?? new Date();

  const events = input.events.map(eventToSvRow);

  // Build enriched map: key = EntryID, value = paragraph. Skip empties.
  const enriched: { [k: string]: LuaValue } = {};
  for (const { id, paragraph } of input.enrichments) {
    if (!id) continue;
    const p = paragraph?.trim();
    if (!p) continue;
    enriched[id] = p;
  }

  const restore: { [k: string]: LuaValue } = {
    schemaVersion: 1,
    forCharacter: input.characterRealm
      ? `${input.characterName}-${input.characterRealm}`
      : input.characterName,
    generatedAt: generatedAt.toISOString(),
  };
  if (input.bible && input.bible.trim()) restore.bible = input.bible.trim();
  if (events.length > 0) restore.events = events;
  if (Object.keys(enriched).length > 0) restore.enriched = enriched;

  const header = formatHeader(input, generatedAt);
  const body = `ChroniclesOfAzerothRestore = ${luaValue(restore)}\n`;
  return header + body;
}

/**
 * Convenience: filename the snippet should be saved as. Matches the addon's
 * SavedVariables registration so the user can drop it in place without
 * renaming.
 */
export const SNIPPET_FILENAME = 'ChroniclesOfAzerothRestore.lua';
