/**
 * Character ingest -- pull normalized character records out of a parsed
 * ChroniclesOfAzeroth SavedVariables file.
 *
 * The addon writes a `characters` table keyed by GUID, with the shape
 * documented at the top of ChroniclesOfAzeroth.lua. This module gives
 * the wizard a clean, typed view over that table without forcing every
 * caller to do their own walk-and-coerce.
 */

import type { LuaValue } from './luaSavedVariables';

export type Classification = 'brand-new' | 'boosted' | 'pre-existing' | 'pending';
export type OnboardingState = 'pending' | 'seeded' | 'complete' | 'skipped';

export interface IngestedCharacter {
  guid: string;
  identity: {
    name: string;
    realm: string;
    class: string;
    classFile?: string;
    race: string;
    raceFile?: string;
    sex: number;            // 1 neutral, 2 male, 3 female
    faction: string;        // 'Alliance' | 'Horde' | 'Neutral'
  };
  firstSeen: {
    timestamp: number;      // unix seconds
    iso: string;
    level: number;
    zoneText?: string;
    subzoneText?: string;
    timePlayedSec: number;  // -1 if RequestTimePlayed unavailable
    levelTimeSec?: number;
    addonBuild?: number;
    project?: string;
    coords?: { x: number; y: number };
  };
  lastSeen?: {
    timestamp: number;
    iso: string;
    level: number;
    zoneText?: string;
    subzoneText?: string;
  };
  classification: Classification;
  classificationReason?: string;
  onboardingState: OnboardingState;
  onboardingPayloadVersion?: number;
  sightings: number;
}

export interface IngestResult {
  characters: IngestedCharacter[];
  /** Anything unexpected -- malformed records, missing required fields, etc. */
  warnings: string[];
  /** Source meta from db.meta (project, build, realm, etc.). */
  meta?: Record<string, LuaValue>;
}

function asObject(v: LuaValue | undefined): Record<string, LuaValue> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, LuaValue>;
  return undefined;
}
function asString(v: LuaValue | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function asNumber(v: LuaValue | undefined, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/**
 * Pull characters out of a parsed SavedVariables payload. Tolerant of
 * missing fields -- the addon's writer order isn't guaranteed across
 * client patches. Anything missing falls back to defaults; anything
 * malformed enough to skip lands in `warnings`.
 */
export function ingestCharactersFromParsed(parsed: Record<string, LuaValue>): IngestResult {
  const result: IngestResult = { characters: [], warnings: [] };

  const db = asObject(parsed.ChroniclesOfAzerothDB);
  if (!db) {
    result.warnings.push('ChroniclesOfAzerothDB variable not found in file.');
    return result;
  }

  result.meta = asObject(db.meta);
  const characters = asObject(db.characters);
  if (!characters) {
    result.warnings.push('characters table not found (addon may be older than v0.2.0).');
    return result;
  }

  for (const [guid, raw] of Object.entries(characters)) {
    const rec = asObject(raw);
    if (!rec) {
      result.warnings.push(`record at guid=${guid} is not a table; skipping`);
      continue;
    }
    const identity = asObject(rec.identity);
    const firstSeen = asObject(rec.firstSeen);
    if (!identity || !firstSeen) {
      result.warnings.push(`record at guid=${guid} missing identity/firstSeen; skipping`);
      continue;
    }
    const coordsObj = asObject(firstSeen.coords);
    const lastSeenObj = asObject(rec.lastSeen);

    const character: IngestedCharacter = {
      guid,
      identity: {
        name: asString(identity.name, '(unknown)'),
        realm: asString(identity.realm),
        class: asString(identity.class, '(unknown)'),
        classFile: asString(identity.classFile) || undefined,
        race: asString(identity.race, '(unknown)'),
        raceFile: asString(identity.raceFile) || undefined,
        sex: asNumber(identity.sex, 1),
        faction: asString(identity.faction, 'Neutral'),
      },
      firstSeen: {
        timestamp: asNumber(firstSeen.timestamp),
        iso: asString(firstSeen.iso),
        level: asNumber(firstSeen.level),
        zoneText: asString(firstSeen.zoneText) || undefined,
        subzoneText: asString(firstSeen.subzoneText) || undefined,
        timePlayedSec: asNumber(firstSeen.timePlayedSec, -1),
        levelTimeSec: typeof firstSeen.levelTimeSec === 'number' ? firstSeen.levelTimeSec : undefined,
        addonBuild: typeof firstSeen.addonBuild === 'number' ? firstSeen.addonBuild : undefined,
        project: asString(firstSeen.project) || undefined,
        coords: coordsObj
          ? { x: asNumber(coordsObj.x), y: asNumber(coordsObj.y) }
          : undefined,
      },
      lastSeen: lastSeenObj
        ? {
            timestamp: asNumber(lastSeenObj.timestamp),
            iso: asString(lastSeenObj.iso),
            level: asNumber(lastSeenObj.level),
            zoneText: asString(lastSeenObj.zoneText) || undefined,
            subzoneText: asString(lastSeenObj.subzoneText) || undefined,
          }
        : undefined,
      classification: (asString(rec.classification, 'pending') as Classification),
      classificationReason: asString(rec.classificationReason) || undefined,
      onboardingState: (asString(rec.onboardingState, 'pending') as OnboardingState),
      onboardingPayloadVersion:
        typeof rec.onboardingPayloadVersion === 'number' ? rec.onboardingPayloadVersion : undefined,
      sightings: asNumber(rec.sightings, 1),
    };
    result.characters.push(character);
  }

  // Sort: most recently seen first (lastSeen.timestamp || firstSeen.timestamp).
  result.characters.sort((a, b) => {
    const ta = a.lastSeen?.timestamp ?? a.firstSeen.timestamp;
    const tb = b.lastSeen?.timestamp ?? b.firstSeen.timestamp;
    return tb - ta;
  });

  return result;
}

/**
 * Build a short, human-readable summary line for a character.
 */
export function describeCharacter(c: IngestedCharacter): string {
  const lvl = c.lastSeen?.level ?? c.firstSeen.level;
  return `${c.identity.name} (${c.identity.realm}) -- ${c.identity.race} ${c.identity.class}, level ${lvl}`;
}

/**
 * Pick the most useful "current location" string for a character.
 */
export function characterLocation(c: IngestedCharacter): string | undefined {
  const last = c.lastSeen?.zoneText;
  if (last) return c.lastSeen?.subzoneText ? `${last} (${c.lastSeen.subzoneText})` : last;
  if (c.firstSeen.zoneText) {
    return c.firstSeen.subzoneText
      ? `${c.firstSeen.zoneText} (${c.firstSeen.subzoneText})`
      : c.firstSeen.zoneText;
  }
  return undefined;
}
