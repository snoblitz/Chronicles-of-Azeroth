// ============================================================================
// Chronicle export — produces a at-CHRONICLE-V1 blob that the Lua addon's
// /coa sync dialog can ingest, populating db.enriched[entryId] = paragraph.
//
// Blob format (matches addon/ChroniclesOfAzeroth/UI/SyncDialog.lua):
//
//   at-CHRONICLE-V1
//   # comments and blank lines OK
//   BIBLE|<overall chapter prose, optional>
//   <EVENT_NAME>:<entry.ts>:<tostring(args[1]) or "">|<paragraph>
//   ...
//   END
//
// Values may be escaped with `\n` / `\t` / `\|`, OR prefixed with `b64:` plus
// base64-encoded UTF-8. We auto-pick b64 when the value contains anything
// that would require escaping; otherwise we ship plain text for readability.
//
// EntryID generator must mirror Lore/Templates.lua T.EntryID byte-for-byte:
//   key = entry.event .. ":" .. entry.ts .. ":" .. tostring(entry.args[1] or "")
// ============================================================================

import type { AddonEvent } from './addonEvents';

export interface ChronicleEnrichment {
  /** EntryID as produced by `entryId(event)`. */
  id: string;
  /** Enriched paragraph (80-150 words is the target; not enforced here). */
  paragraph: string;
}

export interface BuildChronicleBlobInput {
  bible?: string | null;
  enrichments: ChronicleEnrichment[];
}

/** Pad an integer to 2 digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Reconstruct the addon's `ts` field from a Unix-ms timestamp using the
 * current runtime's local time. The addon writes `date("%Y-%m-%dT%H:%M:%S")`
 * which is local, no timezone suffix, second precision.
 */
export function tsLocalIso(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/**
 * Best-effort mapping from AddonEvent.wowEvent → the value the addon would
 * have written as `args[1]`. Only events whose handler in the addon's
 * RegisterAll() actually pushes a useful first arg need to be listed.
 * Anything else falls through to "".
 */
function argKey(event: AddonEvent): string {
  if (event.rawArgs && event.rawArgs.length > 0) {
    const a0 = event.rawArgs[0];
    return a0 === undefined || a0 === null ? '' : String(a0);
  }
  switch (event.wowEvent) {
    case 'QUEST_DETAIL':
    case 'QUEST_ACCEPTED':
    case 'QUEST_PROGRESS':
    case 'QUEST_TURNED_IN':
      return event.questId != null ? String(event.questId) : '';
    case 'PLAYER_LEVEL_UP':
      return event.playerLevel != null ? String(event.playerLevel) : '';
    case 'UNIT_QUEST_LOG_CHANGED':
      return event.unitName ?? '';
    default:
      return '';
  }
}

/**
 * Canonical EntryID — must match `T.EntryID(entry)` in
 * addon/ChroniclesOfAzeroth/Lore/Templates.lua exactly.
 */
export function entryId(event: AddonEvent): string {
  const kind = event.wowEvent || 'EVENT';
  const ts = event.rawTs || tsLocalIso(event.timestamp);
  return `${kind}:${ts}:${argKey(event)}`;
}

const SAFE_PIPE_RE = /[\r\n\t|]/;
const NON_ASCII_RE = /[^\x20-\x7e]/;

/** Base64-encode UTF-8 text using the browser's btoa + TextEncoder. */
function b64encode(s: string): string {
  // btoa requires latin-1; route UTF-8 bytes through it.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Encode a value for the blob. Plain text when safe; otherwise b64: prefixed.
 * Plain text uses backslash escapes for tab, newline, and pipe.
 */
export function encodeValue(raw: string): string {
  if (raw === '') return '';
  // Anything outside printable ASCII or anything multi-line gets b64'd.
  if (NON_ASCII_RE.test(raw) || raw.includes('\r')) {
    return `b64:${b64encode(raw)}`;
  }
  if (!SAFE_PIPE_RE.test(raw)) return raw;
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/** Build the full at-CHRONICLE-V1 blob string. */
export function buildChronicleBlob({ bible, enrichments }: BuildChronicleBlobInput): string {
  const lines: string[] = ['at-CHRONICLE-V1'];
  if (bible && bible.trim()) {
    lines.push(`BIBLE|${encodeValue(bible.trim())}`);
  }
  for (const { id, paragraph } of enrichments) {
    if (!id || !paragraph || !paragraph.trim()) continue;
    lines.push(`${id}|${encodeValue(paragraph.trim())}`);
  }
  lines.push('END');
  return lines.join('\n');
}
