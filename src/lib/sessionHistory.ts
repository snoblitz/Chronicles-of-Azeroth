import type { AddonEvent, AddonEventKind } from './addonEvents';
import type { AddonEventRecord } from './addonEventStore';

const SESSION_IDLE_GAP_MS = 9 * 60 * 60 * 1000;

export interface ChronicleSessionStats {
  questsAccepted: number;
  questsCompleted: number;
  levelsGained: number;
  deaths: number;
  kills: number;
  npcsMet: number;
  itemsUsed: number;
  zonesVisited: string[];
  notableUnits: string[];
  notableItems: string[];
}

export interface ChronicleSession {
  id: string;
  index: number;
  startedAt: number;
  finishedAt: number;
  isOpen: boolean;
  startLevel?: number;
  endLevel?: number;
  startZone?: string;
  endZone?: string;
  records: AddonEventRecord[];
  stats: ChronicleSessionStats;
  title: string;
  campfireRecap: string;
}

interface SessionBucket {
  id: string;
  records: AddonEventRecord[];
}

export function buildChronicleSessions(records: AddonEventRecord[], heroName: string): ChronicleSession[] {
  const sorted = [...records].sort((a, b) => a.event.timestamp - b.event.timestamp);
  const buckets = bucketRecords(sorted);
  return buckets
    .map((bucket, i) => buildSession(bucket, i + 1, heroName))
    .sort((a, b) => b.startedAt - a.startedAt);
}

function bucketRecords(records: AddonEventRecord[]): SessionBucket[] {
  const buckets: SessionBucket[] = [];
  const explicit = new Map<string, SessionBucket>();
  let fallback: SessionBucket | null = null;

  for (const record of records) {
    const event = record.event;
    if (event.sessionId) {
      let bucket = explicit.get(event.sessionId);
      if (!bucket) {
        bucket = { id: event.sessionId, records: [] };
        explicit.set(event.sessionId, bucket);
        buckets.push(bucket);
      }
      bucket.records.push(record);
      continue;
    }

    const previous = fallback?.records[fallback.records.length - 1]?.event;
    const startsNewFallback =
      !fallback
      || event.kind === 'session_start'
      || (previous && event.timestamp - previous.timestamp > SESSION_IDLE_GAP_MS);

    let activeFallback: SessionBucket | null = fallback;
    if (startsNewFallback) {
      activeFallback = { id: `observed_${event.timestamp}`, records: [] };
      fallback = activeFallback;
      buckets.push(activeFallback);
    }
    if (!activeFallback) {
      throw new Error('Unable to build addon session bucket for unscoped event.');
    }
    activeFallback.records.push(record);

    if (event.kind === 'session_end') {
      fallback = null;
    }
  }

  return buckets.filter((bucket) => bucket.records.length > 0);
}

function buildSession(bucket: SessionBucket, index: number, heroName: string): ChronicleSession {
  const records = bucket.records.sort((a, b) => a.event.timestamp - b.event.timestamp);
  const first = records[0].event;
  const last = records[records.length - 1].event;
  const startEvent = records.find((r) => r.event.kind === 'session_start')?.event ?? first;
  const endEvent = [...records].reverse().find((r) => r.event.kind === 'session_end')?.event ?? last;
  const levelEvents = records
    .map((r) => r.event.playerLevel)
    .filter((level): level is number => typeof level === 'number');
  const startLevel = startEvent.playerLevel ?? levelEvents[0];
  const endLevel = endEvent.playerLevel ?? levelEvents[levelEvents.length - 1];
  const zonesVisited = unique(
    records
      .flatMap((r) => [r.event.zone, r.event.subZone])
      .filter((zone): zone is string => Boolean(zone?.trim())),
  );
  const stats: ChronicleSessionStats = {
    questsAccepted: uniqueQuestCount(records, 'quest_accepted'),
    questsCompleted: uniqueQuestCount(records, 'quest_turned_in'),
    levelsGained:
      typeof startLevel === 'number' && typeof endLevel === 'number'
        ? Math.max(0, endLevel - startLevel)
        : countKind(records, 'level_up'),
    deaths: countKind(records, 'player_death'),
    kills: countKind(records, 'unit_kill'),
    npcsMet: unique(records.map((r) => r.event.npcName).filter((name): name is string => Boolean(name))).length,
    itemsUsed: countKind(records, 'item_use'),
    zonesVisited,
    notableUnits: unique(records.map((r) => r.event.unitName).filter((name): name is string => Boolean(name))),
    notableItems: unique(records.map((r) => r.event.itemName).filter((name): name is string => Boolean(name))),
  };

  const isOpen = !records.some((r) => r.event.kind === 'session_end');
  const session: ChronicleSession = {
    id: bucket.id,
    index,
    startedAt: startEvent.timestamp,
    finishedAt: endEvent.timestamp,
    isOpen,
    startLevel,
    endLevel,
    startZone: startEvent.zone ?? zonesVisited[0],
    endZone: endEvent.zone ?? zonesVisited[zonesVisited.length - 1],
    records,
    stats,
    title: sessionTitle(index, records, zonesVisited),
    campfireRecap: '',
  };
  session.campfireRecap = campfireRecap(session, heroName);
  return session;
}

function uniqueQuestCount(records: AddonEventRecord[], kind: AddonEventKind): number {
  const ids = records
    .filter((r) => r.event.kind === kind)
    .map((r) => r.event.questId ?? `${r.event.questName ?? 'quest'}_${r.event.timestamp}`);
  return unique(ids.map(String)).length;
}

function countKind(records: AddonEventRecord[], kind: AddonEventKind): number {
  return records.filter((r) => r.event.kind === kind).length;
}

function sessionTitle(index: number, records: AddonEventRecord[], zones: string[]): string {
  const chains = unique(records.map((r) => r.event.chainTitle).filter((title): title is string => Boolean(title)));
  if (chains.length > 0) return `Session ${index}: ${chains[0]}`;
  if (zones.length === 1) return `Session ${index}: ${zones[0]}`;
  if (zones.length > 1) return `Session ${index}: ${zones[0]} to ${zones[zones.length - 1]}`;
  return `Session ${index}: Roadside notes`;
}

function campfireRecap(session: ChronicleSession, heroName: string): string {
  const levelText =
    typeof session.startLevel === 'number' && typeof session.endLevel === 'number'
      ? `level ${session.startLevel} to ${session.endLevel}`
      : typeof session.endLevel === 'number'
        ? `level ${session.endLevel}`
        : 'the same uncertain level';
  const zones = session.stats.zonesVisited.length > 0
    ? session.stats.zonesVisited.join(' -> ')
    : 'the road';
  const questText = session.stats.questsCompleted === 1
    ? '1 quest completed'
    : `${session.stats.questsCompleted} quests completed`;
  const deathText = session.stats.deaths > 0
    ? `, ${session.stats.deaths} death${session.stats.deaths === 1 ? '' : 's'} endured`
    : '';
  const killText = session.stats.notableUnits.length > 0
    ? ` Notable foes: ${session.stats.notableUnits.slice(0, 3).join(', ')}.`
    : '';
  const endText = session.isOpen
    ? ' The fire is still burning; this session has not been closed yet.'
    : ' By the time the fire burned low, the road had a new chapter worth remembering.';

  return [
    `By the campfire, ${heroName}'s path ran through ${zones}, carrying them from ${levelText}.`,
    `The addon saw ${questText}${deathText}, ${session.stats.kills} notable kill${session.stats.kills === 1 ? '' : 's'}, and ${session.stats.npcsMet} NPC encounter${session.stats.npcsMet === 1 ? '' : 's'}.${killText}`,
    endText,
  ].join(' ');
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function eventFactLine(event: AddonEvent): string {
  const context = [
    event.questName ? `Quest: ${event.questName}` : null,
    event.npcName ? `NPC: ${event.npcName}` : null,
    event.unitName ? `Unit: ${event.unitName}` : null,
    event.itemName ? `Item: ${event.itemName}` : null,
    typeof event.playerLevel === 'number' ? `Lvl ${event.playerLevel}` : null,
    event.zone,
    event.subZone,
  ]
    .filter(Boolean)
    .join(' · ');
  return context ? `${event.summary} (${context})` : event.summary;
}
