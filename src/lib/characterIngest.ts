/**
 * Character ingest -- pull normalized character records out of a parsed
 * Aftertale SavedVariables file.
 *
 * The addon writes a `characters` table keyed by GUID, with the shape
 * documented at the top of Aftertale.lua. This module gives
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

  const db = asObject(parsed.AftertaleDB);
  if (!db) {
    result.warnings.push('AftertaleDB variable not found in file.');
    return result;
  }

  result.meta = asObject(db.meta);
  const characters = asObject(db.characters);
  if (!characters) {
    result.warnings.push('characters table not found (addon may be older than v0.2.0).');
    return result;
  }

  // Derive a per-GUID "live" snapshot from the events log. The addon's
  // characters.firstSeen is a permanent first-sighting record, and lastSeen
  // is only populated by newer addon builds, so without this synthesis the
  // picker shows whatever level the toon was at the moment Aftertale first
  // loaded -- e.g. "level 1" for a character who has since dinged to 5.
  // Level is taken as the MAX observed (level only goes up; logout snapshots
  // can carry stale UnitLevel=1 from teardown state). Zone is taken from the
  // latest event by timestamp that actually has a non-empty zoneText.
  // We bucket by BOTH guid and charName so events whose char GUID doesn't
  // line up with the registry key (e.g. older addon builds, manual SV edits)
  // can still hydrate the picker via a name-based fallback.
  const { byGuid: eventSnapshots, byName: eventSnapshotsByName } = collectEventSnapshots(db.events);

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
    const identityName = asString(identity.name, '');
    const derived =
      eventSnapshots.get(guid) ??
      (identityName ? eventSnapshotsByName.get(identityName.toLowerCase()) : undefined);

    // Prefer the addon-written lastSeen when present, otherwise synthesize
    // from event-log scan. Merge field-by-field so we never DOWNGRADE level
    // from a derived max back to an addon-written stale snapshot.
    let lastSeen: IngestedCharacter['lastSeen'];
    if (lastSeenObj || derived) {
      const baseLevel = lastSeenObj ? asNumber(lastSeenObj.level) : 0;
      const derivedLevel = derived?.level ?? 0;
      const baseTs = lastSeenObj ? asNumber(lastSeenObj.timestamp) : 0;
      const derivedTs = derived?.timestamp ?? 0;
      lastSeen = {
        timestamp: Math.max(baseTs, derivedTs),
        iso: derivedTs > baseTs && derived?.iso
          ? derived.iso
          : asString(lastSeenObj?.iso ?? ''),
        level: Math.max(baseLevel, derivedLevel),
        zoneText:
          (lastSeenObj && asString(lastSeenObj.zoneText)) || derived?.zoneText || undefined,
        subzoneText:
          (lastSeenObj && asString(lastSeenObj.subzoneText)) || derived?.subzoneText || undefined,
      };
    }

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
      lastSeen,
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

interface EventSnapshot {
  level: number;
  timestamp: number;
  iso?: string;
  zoneText?: string;
  subzoneText?: string;
}

function collectEventSnapshots(rawEvents: LuaValue | undefined): {
  byGuid: Map<string, EventSnapshot>;
  byName: Map<string, EventSnapshot>;
} {
  const byGuid = new Map<string, EventSnapshot>();
  const byName = new Map<string, EventSnapshot>();
  if (!rawEvents || typeof rawEvents !== 'object') return { byGuid, byName };
  const list: LuaValue[] = Array.isArray(rawEvents)
    ? (rawEvents as LuaValue[])
    : Object.values(rawEvents as Record<string, LuaValue>);
  for (const item of list) {
    const ev = asObject(item);
    if (!ev) continue;
    const guid = asString(ev.char);
    const charName = asString(ev.charName).toLowerCase();
    if (!guid && !charName) continue;
    const enrichment = asObject(ev.enrichment);
    const lvl = enrichment ? asNumber(enrichment.level, 0) : 0;
    const iso = asString(ev.ts);
    const ts = isoToUnix(iso);
    const zoneText = enrichment ? asString(enrichment.zoneText) : '';
    const subzoneText = enrichment ? asString(enrichment.subzoneText) : '';
    const apply = (bucket: Map<string, EventSnapshot>, key: string) => {
      if (!key) return;
      const prior = bucket.get(key);
      if (!prior) {
        bucket.set(key, {
          level: lvl,
          timestamp: ts,
          iso: iso || undefined,
          zoneText: zoneText || undefined,
          subzoneText: subzoneText || undefined,
        });
        return;
      }
      if (lvl > prior.level) prior.level = lvl;
      if (ts > prior.timestamp) {
        prior.timestamp = ts;
        prior.iso = iso || prior.iso;
        if (zoneText) {
          prior.zoneText = zoneText;
          prior.subzoneText = subzoneText || undefined;
        }
      } else if (zoneText && !prior.zoneText) {
        prior.zoneText = zoneText;
        prior.subzoneText = subzoneText || undefined;
      }
    };
    apply(byGuid, guid);
    apply(byName, charName);
  }
  return { byGuid, byName };
}

function isoToUnix(iso: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
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
