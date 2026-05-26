import { useEffect, useMemo, useState } from 'react';
import { ModelPicker } from './ModelPicker';
import { AddonImport } from './AddonImport';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { loadBible } from '../lib/bibleStore';
import { loadAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import {
  buildChronicleSessions,
  eventFactLine,
  type ChronicleSession,
} from '../lib/sessionHistory';
import { buildChronicleBlob, entryId } from '../lib/chronicleExport';
import { enrichEvent } from '../lib/eventEnrichment';
import type { AddonEvent } from '../lib/addonEvents';
import type { CharacterBible, HistoryEntry, LLMResponse } from '../types';

const SESSION_WINDOW_MS = 9 * 60 * 60 * 1000;
const FULL_RECAP_ENTRY_LIMIT = 40;

type ReaderMode = 'latest' | 'full' | 'sessions';

interface Chapter {
  id: string;
  title: string;
  entries: HistoryEntry[];
  zones: string[];
  start: number;
  end: number;
}

export function ChronicleReader() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [mode, setMode] = useState<ReaderMode>('latest');
  const [modelIdx, setModelIdx] = useState(DEFAULT_MODEL_INDEX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<LLMResponse | null>(null);
  const [addonRecords, setAddonRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('coa:bible-updated', onUpdate);
    return () => window.removeEventListener('coa:bible-updated', onUpdate);
  }, []);

  useEffect(() => {
    const onAddonUpdate = () => setAddonRecords(loadAddonEventRecords());
    window.addEventListener('coa:addon-events-updated', onAddonUpdate);
    window.addEventListener('storage', onAddonUpdate);
    return () => {
      window.removeEventListener('coa:addon-events-updated', onAddonUpdate);
      window.removeEventListener('storage', onAddonUpdate);
    };
  }, []);

  const entries = useMemo(
    () => [...(bible?.history ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [bible],
  );
  const characterKey = bible ? String(bible.createdAt) : null;
  const scopedAddonRecords = useMemo(
    () => (characterKey ? addonRecords.filter((record) => record.characterKey === characterKey) : []),
    [addonRecords, characterKey],
  );
  const sessions = useMemo(
    () => (bible ? buildChronicleSessions(scopedAddonRecords, bible.name) : []),
    [bible, scopedAddonRecords],
  );
  const latestEntries = useMemo(() => latestSessionEntries(entries), [entries]);
  const visibleEntries = mode === 'full' ? entries : latestEntries;
  const chapters = useMemo(() => buildChapters(entries), [entries]);
  const visibleChapters = useMemo(() => buildChapters(visibleEntries), [visibleEntries]);
  const insight = bible ? buildInsight(bible, visibleEntries, entries) : null;
  const hasStoryData = entries.length > 0 || sessions.length > 0;

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('coa:request-tab', { detail: tab }));
  }

  async function generateRecap() {
    if (!bible || mode === 'sessions' || visibleEntries.length === 0) return;
    setBusy(true);
    setError(null);
    setRecap(null);
    try {
      const scopedEntries =
        mode === 'latest'
          ? visibleEntries
          : visibleEntries.slice(-FULL_RECAP_ENTRY_LIMIT);
      const res = await requestCampfireRecap(
        modelIdx,
        buildRecapPrompt(bible, scopedEntries, mode, visibleEntries.length),
      );
      setRecap(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!bible) {
    return (
      <section className="coa-panel coa-chronicle-reader">
        <h2>Chronicle</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Select or roll a hero first. The Chronicle turns quest turn-ins, levels, zones, and manual notes into the story you read after a session.
        </p>
        <div className="coa-chronicle-empty-actions">
          <button className="coa-btn coa-btn-primary" onClick={() => requestTab('character')}>
            ◆ Choose a hero
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="coa-panel coa-chronicle-reader">
      <header className="coa-chronicle-hero">
        <div>
          <p className="coa-kicker">Story ledger</p>
          <h2>{bible.name}'s Chronicle</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            The "so what" layer: read the session, scan the arc, then generate a campfire recap when the log deserves prose.
          </p>
        </div>
        <div className="coa-chronicle-hero-pills">
          <span>{bible.faction}</span>
          <span>{bible.race} {bible.class}</span>
          {typeof bible.level === 'number' && <span>Lvl {bible.level}</span>}
          {bible.currentZone && <span>{bible.currentZone}</span>}
        </div>
      </header>

      <div className="coa-chronicle-modebar" role="tablist" aria-label="Chronicle view">
        <button
          className="coa-btn coa-btn-secondary"
          aria-pressed={mode === 'latest'}
          onClick={() => {
            setMode('latest');
            setRecap(null);
          }}
        >
          Latest session
        </button>
        <button
          className="coa-btn coa-btn-secondary"
          aria-pressed={mode === 'full'}
          onClick={() => {
            setMode('full');
            setRecap(null);
          }}
        >
          Full saga
        </button>
        <button
          className="coa-btn coa-btn-secondary"
          aria-pressed={mode === 'sessions'}
          onClick={() => {
            setMode('sessions');
            setRecap(null);
          }}
        >
          Session trail
        </button>
      </div>

      {!hasStoryData ? (
        <div className="coa-chronicle-empty">
          <h3>No story entries yet</h3>
          <p className="muted">
            Drop your <code>ChroniclesOfAzeroth.lua</code> below to pull in real game data, or run the Addon Sim, or add manual deeds from the character sheet.
          </p>
          <AddonImport />
          <div className="coa-chronicle-empty-actions" style={{ marginTop: '1rem' }}>
            <button className="coa-btn coa-btn-primary" onClick={() => requestTab('addon')}>
              ◆ Open Addon Sim
            </button>
            <button className="coa-btn coa-btn-secondary" onClick={() => requestTab('character')}>
              Add manual entry
            </button>
          </div>
        </div>
      ) : (
        <>
          <AddonImport />
          {mode !== 'sessions' && insight && <InsightGrid insight={insight} mode={mode} />}

          {mode !== 'sessions' && visibleEntries.length > 0 && (
            <section className="coa-chronicle-generate">
              <div>
                <h3>Campfire recap</h3>
                <p className="muted">
                  Generate a readable chapter from {visibleEntries.length} chronicle {visibleEntries.length === 1 ? 'entry' : 'entries'}.
                  {mode === 'full' && visibleEntries.length > FULL_RECAP_ENTRY_LIMIT
                    ? ` The prompt uses the latest ${FULL_RECAP_ENTRY_LIMIT} entries to stay focused.`
                    : ''}
                </p>
              </div>
              <div className="coa-chronicle-generate-controls">
                <ModelPicker value={modelIdx} onChange={setModelIdx} disabled={busy} label="Narrator model" />
                <button
                  className="coa-btn coa-btn-primary"
                  onClick={generateRecap}
                  disabled={busy || visibleEntries.length === 0}
                >
                  {busy ? 'Writing...' : '◆ Write recap'}
                </button>
              </div>
            </section>
          )}

          {error && (
            <div className="coa-callout-danger coa-chronicle-error">
              <strong>Recap failed:</strong> {error}
            </div>
          )}

          {recap && <CampfireRecapArticle recap={recap} />}

          {mode === 'sessions' ? (
            <SessionTrail
              sessions={sessions}
              bible={bible}
              modelIdx={modelIdx}
              onModelChange={setModelIdx}
            />
          ) : (
            <section className="coa-chronicle-book">
              <header>
                <div>
                  <p className="coa-kicker">{mode === 'latest' ? 'Tonight at the table' : 'The road so far'}</p>
                  <h3>{mode === 'latest' ? latestSessionTitle(visibleEntries) : 'Full saga timeline'}</h3>
                </div>
                <span className="coa-chronicle-count">{visibleEntries.length} deeds</span>
              </header>

              {visibleChapters.length === 0 ? (
                <p className="muted">No entries fall inside the latest-session window. Switch to Full saga or Session trail.</p>
              ) : (
                <div className="coa-chronicle-chapters">
                  {visibleChapters.map((chapter, i) => (
                    <article key={chapter.id} className="coa-chronicle-chapter">
                      <div className="coa-chronicle-chapter-head">
                        <span className="coa-chronicle-chapter-num">Chapter {i + 1}</span>
                        <h4>{chapter.title}</h4>
                        <span>{formatDateRange(chapter.start, chapter.end)}</span>
                      </div>
                      <ol>
                        {chapter.entries.map((entry) => (
                          <li key={entry.id}>
                            <span>{formatEntryTime(entry.timestamp)}</span>
                            <p>{entry.text}</p>
                            {entryContext(entry) && <small>{entryContext(entry)}</small>}
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {mode !== 'sessions' && chapters.length > 0 && (
            <section className="coa-chronicle-arc-map">
              <p className="coa-kicker">Arc map</p>
              <div>
                {chapters.map((chapter, i) => (
                  <span key={chapter.id}>
                    {i + 1}. {chapter.title}
                  </span>
                ))}
              </div>
            </section>
          )}

          {scopedAddonRecords.length > 0 && (
            <CompanionExport bible={bible} records={scopedAddonRecords} />
          )}
        </>
      )}
    </section>
  );
}

function latestSessionEntries(entries: HistoryEntry[]): HistoryEntry[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1].timestamp;
  return entries.filter((entry) => latest - entry.timestamp <= SESSION_WINDOW_MS);
}

const ENRICH_CONCURRENCY = 3;

function CompanionExport({
  bible,
  records,
}: {
  bible: CharacterBible;
  records: AddonEventRecord[];
}) {
  const events = useMemo<AddonEvent[]>(
    () => [...records].sort((a, b) => a.event.timestamp - b.event.timestamp).map((r) => r.event),
    [records],
  );

  const [modelIdx, setModelIdx] = useState(DEFAULT_MODEL_INDEX);
  const [enriched, setEnriched] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ count: number; cost: number } | null>(null);
  const [includeBible, setIncludeBible] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const ids = useMemo(() => events.map((event) => entryId(event)), [events]);
  const enrichedCount = useMemo(
    () => ids.filter((id) => Boolean(enriched[id])).length,
    [ids, enriched],
  );

  const bibleProse = useMemo(() => {
    if (!includeBible) return null;
    const lines = [
      bible.backstory?.trim(),
      bible.coreQuote ? `Core sentence: ${bible.coreQuote}` : null,
    ].filter((l): l is string => Boolean(l && l.trim()));
    return lines.length ? lines.join('\n\n') : null;
  }, [bible, includeBible]);

  const blob = useMemo(
    () =>
      buildChronicleBlob({
        bible: bibleProse,
        enrichments: ids
          .map((id) => ({ id, paragraph: enriched[id] ?? '' }))
          .filter((e) => e.paragraph.trim().length > 0),
      }),
    [bibleProse, ids, enriched],
  );

  async function runEnrichAll() {
    if (busy || events.length === 0) return;
    setBusy(true);
    setError(null);
    setLastUsage(null);
    const queue = events.filter((event) => !enriched[entryId(event)]);
    const total = queue.length;
    if (total === 0) {
      setBusy(false);
      return;
    }
    setProgress({ done: 0, total });
    let done = 0;
    let cost = 0;
    try {
      for (let i = 0; i < queue.length; i += ENRICH_CONCURRENCY) {
        const batch = queue.slice(i, i + ENRICH_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (event) => {
            try {
              const res = await enrichEvent(event, bible, modelIdx);
              return { id: entryId(event), paragraph: res.paragraph, response: res.response };
            } catch (err) {
              return { id: entryId(event), error: err instanceof Error ? err.message : String(err) };
            }
          }),
        );
        setEnriched((current) => {
          const next = { ...current };
          for (const r of results) {
            if ('paragraph' in r && r.paragraph) next[r.id] = r.paragraph;
          }
          return next;
        });
        for (const r of results) {
          if ('response' in r && r.response) cost += guessCostUsd(r.response);
          if ('error' in r && r.error && !error) setError(r.error);
        }
        done += batch.length;
        setProgress({ done, total });
      }
      setLastUsage({ count: done, cost });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function copyBlob() {
    try {
      await navigator.clipboard.writeText(blob);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 2200);
    }
  }

  function downloadBlob() {
    const file = new Blob([blob], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronicle_${bible.name.replace(/\s+/g, '_')}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="coa-chronicle-generate" style={{ marginTop: '1.5rem' }}>
      <div>
        <p className="coa-kicker">Companion export</p>
        <h3>Send enriched chronicle back to the addon</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Generate one prose paragraph per addon event, then paste the resulting{' '}
          <code>COA-CHRONICLE-V1</code> blob into <code>/coa sync</code> inside WoW.
          The addon stores each paragraph under its EntryID so the parchment book renders
          your story instead of the default templated line.
        </p>
        <p className="muted" style={{ marginTop: '0.25rem' }}>
          {events.length} addon {events.length === 1 ? 'event' : 'events'} ·{' '}
          {enrichedCount} enriched
          {lastUsage
            ? ` · last run: ${lastUsage.count} calls, ~$${lastUsage.cost.toFixed(4)}`
            : ''}
        </p>
      </div>
      <div className="coa-chronicle-generate-controls" style={{ flexWrap: 'wrap' }}>
        <ModelPicker value={modelIdx} onChange={setModelIdx} disabled={busy} label="Enrichment model" />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
          }}
        >
          <input
            type="checkbox"
            checked={includeBible}
            onChange={(e) => setIncludeBible(e.target.checked)}
            disabled={busy}
          />
          Include BIBLE line
        </label>
        <button
          className="coa-btn coa-btn-primary"
          onClick={runEnrichAll}
          disabled={busy || events.length === 0}
          title="Calls the LLM once per event. Skips events already enriched."
        >
          {busy && progress
            ? `Enriching... ${progress.done}/${progress.total}`
            : enrichedCount === events.length && events.length > 0
              ? '◆ Re-run missing (none)'
              : `◆ Enrich ${events.length - enrichedCount || events.length} event${
                  (events.length - enrichedCount || events.length) === 1 ? '' : 's'
                }`}
        </button>
        <button
          className="coa-btn coa-btn-secondary"
          onClick={copyBlob}
          disabled={busy || enrichedCount === 0}
          title="Copy the COA-CHRONICLE-V1 blob to your clipboard"
        >
          {copyState === 'copied'
            ? '✓ Copied'
            : copyState === 'failed'
              ? '✗ Clipboard blocked'
              : '⧉ Copy chronicle blob'}
        </button>
        <button
          className="coa-btn coa-btn-secondary"
          onClick={downloadBlob}
          disabled={busy || enrichedCount === 0}
          title="Download the blob as a .txt file"
        >
          ⬇ Download .txt
        </button>
        {enrichedCount > 0 && (
          <button
            className="coa-btn coa-btn-secondary"
            onClick={() => setEnriched({})}
            disabled={busy}
            title="Discard generated paragraphs and start over"
          >
            ✕ Clear enrichments
          </button>
        )}
      </div>
      {error && (
        <div className="coa-callout-danger coa-chronicle-error" style={{ marginTop: '0.75rem' }}>
          <strong>Enrichment hit a snag:</strong> {error}
        </div>
      )}
      {enrichedCount > 0 && (
        <details style={{ marginTop: '0.75rem' }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            Preview blob ({blob.length.toLocaleString()} chars)
          </summary>
          <pre
            style={{
              maxHeight: '320px',
              overflow: 'auto',
              padding: '0.75rem',
              background: 'var(--cp-surface-soft, rgba(0,0,0,0.04))',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              borderRadius: '0.5rem',
              marginTop: '0.5rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {blob}
          </pre>
        </details>
      )}
    </section>
  );
}

function guessCostUsd(response: LLMResponse): number {
  // Best-effort: the response may carry costUsd directly (some providers).
  const maybe = (response as unknown as { costUsd?: number }).costUsd;
  return typeof maybe === 'number' ? maybe : 0;
}


function buildChapters(entries: HistoryEntry[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (const entry of entries) {
    const zone = entry.zone?.trim() || 'The road';
    const last = chapters[chapters.length - 1];
    if (!last || !last.zones.includes(zone)) {
      chapters.push({
        id: `${entry.id}_chapter`,
        title: zone,
        entries: [entry],
        zones: [zone],
        start: entry.timestamp,
        end: entry.timestamp,
      });
      continue;
    }
    last.entries.push(entry);
    last.end = entry.timestamp;
  }
  return chapters;
}

function buildInsight(bible: CharacterBible, visibleEntries: HistoryEntry[], allEntries: HistoryEntry[]) {
  const first = visibleEntries[0] ?? allEntries[0];
  const last = visibleEntries[visibleEntries.length - 1] ?? allEntries[allEntries.length - 1];
  const zones = unique(visibleEntries.map((entry) => entry.zone).filter((z): z is string => Boolean(z)));
  const levels = visibleEntries
    .map((entry) => entry.level)
    .filter((level): level is number => typeof level === 'number');
  const firstLevel = levels[0];
  const lastLevel = levels[levels.length - 1];
  const levelDelta =
    typeof firstLevel === 'number' && typeof lastLevel === 'number'
      ? Math.max(0, lastLevel - firstLevel)
      : 0;

  return {
    deeds: visibleEntries.length,
    zones,
    levelDelta,
    firstText: first?.text ?? '',
    lastText: last?.text ?? '',
    pressure:
      bible.coreQuote?.trim()
      || bible.motivations[0]
      || bible.beliefs[0]
      || `${bible.name} is still deciding what kind of hero the road will make.`,
    nextHook: last
      ? `The next NPC should remember this: ${last.text}`
      : 'Start logging quest turn-ins or manual deeds, then this becomes a living story hook.',
  };
}

function InsightGrid({
  insight,
  mode,
}: {
  insight: ReturnType<typeof buildInsight>;
  mode: ReaderMode;
}) {
  return (
    <div className="coa-chronicle-insights">
      <article>
        <span>Session shape</span>
        <strong>{insight.deeds} deeds</strong>
        <p>
          {mode === 'latest' ? 'Latest-session window' : 'Full chronicle'} ·{' '}
          {insight.zones.length > 0 ? insight.zones.join(' → ') : 'no zone snapshots yet'}
        </p>
      </article>
      <article>
        <span>Power shifted</span>
        <strong>{insight.levelDelta > 0 ? `+${insight.levelDelta} levels` : 'No level jump'}</strong>
        <p>{insight.levelDelta > 0 ? 'The road visibly changed the hero.' : 'The change was story-first, not stats-first.'}</p>
      </article>
      <article>
        <span>Character pressure</span>
        <strong>Why it matters</strong>
        <p>{insight.pressure}</p>
      </article>
      <article>
        <span>Next hook</span>
        <strong>Carry forward</strong>
        <p>{insight.nextHook}</p>
      </article>
    </div>
  );
}

async function requestCampfireRecap(modelIdx: number, prompt: string): Promise<LLMResponse> {
  const choice = MODEL_CHOICES[modelIdx];
  const provider = await choice.factory();
  return provider.chat({
    task: 'summary',
    model: choice.pricingKey,
    maxTokens: 1800,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: [
          'You are the in-world chronicler for Chronicles of Azeroth.',
          'Write polished story prose from structured character-history notes.',
          'Use only the provided facts. Do not invent completed quests, locations, NPC relationships, or outcomes.',
          'Keep the hero as the subject. Do not mention prompts, models, localStorage, UI tabs, or the app.',
          'Output plain text with a title, 3-5 short paragraphs, and a final "So what changed:" section with 3 bullets.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
}

function CampfireRecapArticle({ recap }: { recap: LLMResponse }) {
  return (
    <article className="coa-chronicle-recap">
      <span className="coa-bubble-label">CAMPFIRE RECAP</span>
      <div>{recap.text}</div>
      <footer>
        {recap.inputTokens} in / {recap.cachedInputTokens} cached / {recap.outputTokens} out ·{' '}
        {recap.latencyMs.toFixed(0)}ms · {recap.model}
      </footer>
    </article>
  );
}

function SessionTrail({
  sessions,
  bible,
  modelIdx,
  onModelChange,
}: {
  sessions: ChronicleSession[];
  bible: CharacterBible;
  modelIdx: number;
  onModelChange: (modelIdx: number) => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRecaps, setSessionRecaps] = useState<Record<string, LLMResponse>>({});

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  async function generateSelectedSessionRecap(session: ChronicleSession) {
    setBusySessionId(session.id);
    setSessionError(null);
    try {
      const res = await requestCampfireRecap(modelIdx, buildSessionRecapPrompt(bible, session));
      setSessionRecaps((current) => ({ ...current, [session.id]: res }));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <section className="coa-chronicle-book coa-session-trail">
      <header>
        <div>
          <p className="coa-kicker">Session history</p>
          <h3>The trail by play session</h3>
        </div>
        <span className="coa-chronicle-count">{sessions.length} sessions</span>
      </header>

      {sessions.length === 0 ? (
        <p className="muted">
          No addon-observed sessions yet. Open Addon Sim, start a session, emit a few WoW events, then end the session.
        </p>
      ) : (
        <div className="coa-session-list">
          {sessions.map((session) => (
            <details key={session.id} className="coa-session-card" open={selectedSessionId === session.id}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setSelectedSessionId(session.id);
                  setSessionError(null);
                }}
              >
                <div>
                  <span className="coa-chronicle-chapter-num">{session.isOpen ? 'Active session' : 'Closed session'}</span>
                  <h4>{session.title}</h4>
                  <p>
                    {formatDateRange(session.startedAt, session.finishedAt)}
                    {' · '}
                    {formatDuration(session.finishedAt - session.startedAt)}
                  </p>
                </div>
                <strong>{session.stats.questsCompleted} quests · +{session.stats.levelsGained} levels</strong>
              </summary>

              <section className="coa-session-campfire-hero">
                <div className="coa-session-campfire-head">
                  <div>
                    <p className="coa-kicker">Selected session campfire</p>
                    <h4>Make this session the story</h4>
                    <p className="muted">
                      Writes the same full campfire recap as Latest session, scoped to this session's addon-observed facts.
                    </p>
                  </div>
                  <div className="coa-chronicle-generate-controls">
                    <ModelPicker value={modelIdx} onChange={onModelChange} disabled={Boolean(busySessionId)} label="Narrator model" />
                    <button
                      className="coa-btn coa-btn-primary"
                      onClick={() => generateSelectedSessionRecap(session)}
                      disabled={Boolean(busySessionId)}
                    >
                      {busySessionId === session.id ? 'Writing...' : '◆ Write session recap'}
                    </button>
                  </div>
                </div>

                {sessionError && selectedSessionId === session.id && (
                  <div className="coa-callout-danger coa-chronicle-error">
                    <strong>Session recap failed:</strong> {sessionError}
                  </div>
                )}

                {sessionRecaps[session.id] ? (
                  <CampfireRecapArticle recap={sessionRecaps[session.id]} />
                ) : (
                  <p className="coa-session-campfire-empty">
                    No generated recap yet. Pick this session, hit the button, and the Chronicle will turn these facts into the
                    title, paragraphs, and "So what changed" section.
                  </p>
                )}
              </section>

              <div className="coa-session-stats">
                <article>
                  <span>Session window</span>
                  <strong>
                    {formatEntryTime(session.startedAt)} {'->'} {session.isOpen ? 'still active' : formatEntryTime(session.finishedAt)}
                  </strong>
                  <p>{formatDuration(session.finishedAt - session.startedAt)}</p>
                </article>
                <article>
                  <span>Level movement</span>
                  <strong>{levelRange(session)}</strong>
                  <p>{session.stats.levelsGained > 0 ? `${session.stats.levelsGained} level gains observed` : 'No level-up delta observed'}</p>
                </article>
                <article>
                  <span>Quest work</span>
                  <strong>{session.stats.questsCompleted} completed</strong>
                  <p>{session.stats.questsAccepted} accepted during the session</p>
                </article>
                <article>
                  <span>Road hazards</span>
                  <strong>{session.stats.deaths} deaths</strong>
                  <p>{session.stats.kills} notable kills · {session.stats.npcsMet} NPCs met</p>
                </article>
              </div>

              <div className="coa-session-meta">
                <span>Zones: {session.stats.zonesVisited.length > 0 ? session.stats.zonesVisited.join(' -> ') : 'not captured'}</span>
                {session.stats.notableItems.length > 0 && <span>Items: {session.stats.notableItems.join(', ')}</span>}
                {session.stats.notableUnits.length > 0 && <span>Foes: {session.stats.notableUnits.join(', ')}</span>}
              </div>

              <div className="coa-session-events">
                <p className="coa-kicker">Addon-observed facts</p>
                <ol>
                  {session.records.map((record) => (
                    <li key={record.event.id}>
                      <span>{formatEntryTime(record.event.timestamp)}</span>
                      <p>{eventFactLine(record.event)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function buildSessionRecapPrompt(bible: CharacterBible, session: ChronicleSession): string {
  const historyEntries = (bible.history ?? []).filter((entry) =>
    session.records.some((record) => entry.id === `addon_${record.event.id}`),
  );

  return [
    `Hero: ${bible.name}, ${bible.faction} ${bible.race} ${bible.class}`,
    typeof bible.level === 'number' ? `Current level: ${bible.level}` : null,
    bible.currentZone ? `Current zone: ${bible.currentZone}` : null,
    bible.homeland ? `Homeland: ${bible.homeland}` : null,
    bible.coreQuote ? `Core sentence: ${bible.coreQuote}` : null,
    '',
    'Voice:',
    bible.voice,
    '',
    'Backstory:',
    bible.backstory,
    '',
    'Beliefs:',
    ...bible.beliefs.map((belief) => `- ${belief}`),
    '',
    'Motivations:',
    ...bible.motivations.map((motivation) => `- ${motivation}`),
    ...(bible.fears && bible.fears.length > 0
      ? ['', 'Fears:', ...bible.fears.map((fear) => `- ${fear}`)]
      : []),
    ...(bible.flaws && bible.flaws.length > 0
      ? ['', 'Flaws:', ...bible.flaws.map((flaw) => `- ${flaw}`)]
      : []),
    '',
    'Scope: selected addon-observed play session from Session trail.',
    'Write this as character story, not a stats dashboard. Use counters only when they support the narrative.',
    `Session title: ${session.title}`,
    `Session window: ${formatDateRange(session.startedAt, session.finishedAt)}`,
    `Duration: ${formatDuration(session.finishedAt - session.startedAt)}`,
    `Level movement: ${levelRange(session)}`,
    session.startZone || session.endZone ? `Zone movement: ${session.startZone ?? 'unknown'} -> ${session.endZone ?? 'unknown'}` : null,
    session.stats.zonesVisited.length > 0 ? `Zones observed: ${session.stats.zonesVisited.join(' -> ')}` : null,
    `Session facts: ${session.stats.questsAccepted} quests accepted, ${session.stats.questsCompleted} quests completed, ${session.stats.levelsGained} levels gained, ${session.stats.deaths} deaths, ${session.stats.kills} notable kills, ${session.stats.npcsMet} NPCs met.`,
    session.stats.notableUnits.length > 0 ? `Notable foes: ${session.stats.notableUnits.join(', ')}` : null,
    session.stats.notableItems.length > 0 ? `Notable items: ${session.stats.notableItems.join(', ')}` : null,
    session.isOpen ? 'Session status: still active; do not write it as fully resolved.' : 'Session status: closed.',
    '',
    historyEntries.length > 0 ? 'Chronicle entries from this session, oldest first:' : null,
    ...historyEntries.map((entry) => `- ${formatPromptTimestamp(entry.timestamp)}${entryContext(entry) ? ` (${entryContext(entry)})` : ''}: ${entry.text}`),
    historyEntries.length > 0 ? '' : null,
    'Addon-observed facts from this session, oldest first:',
    ...session.records.map(sessionRecordPromptLine),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function sessionRecordPromptLine(record: AddonEventRecord): string {
  const event = record.event;
  const story = event.storyCard
    ? [
        `story moment: ${event.storyCard.moment}`,
        `setup: ${event.storyCard.setup}`,
        `player action: ${event.storyCard.playerAction}`,
        `outcome: ${event.storyCard.outcome}`,
        `emotional weight: ${event.storyCard.emotionalWeight}`,
        `chronicle entry: ${event.storyCard.chronicleEntry}`,
      ].join('; ')
    : null;
  const questText = event.questTextEnrichment?.text.trim()
    ? `quest text note: ${event.questTextEnrichment.text.trim()}`
    : null;
  return [
    `- ${formatPromptTimestamp(event.timestamp)}: ${eventFactLine(event)}`,
    story ? ` [${story}]` : '',
    questText ? ` [${questText}]` : '',
  ].join('');
}

function buildRecapPrompt(
  bible: CharacterBible,
  entries: HistoryEntry[],
  mode: ReaderMode,
  totalVisibleEntries: number,
): string {
  return [
    `Hero: ${bible.name}, ${bible.faction} ${bible.race} ${bible.class}`,
    typeof bible.level === 'number' ? `Current level: ${bible.level}` : null,
    bible.currentZone ? `Current zone: ${bible.currentZone}` : null,
    bible.homeland ? `Homeland: ${bible.homeland}` : null,
    bible.coreQuote ? `Core sentence: ${bible.coreQuote}` : null,
    '',
    'Voice:',
    bible.voice,
    '',
    'Backstory:',
    bible.backstory,
    '',
    'Beliefs:',
    ...bible.beliefs.map((belief) => `- ${belief}`),
    '',
    'Motivations:',
    ...bible.motivations.map((motivation) => `- ${motivation}`),
    ...(bible.fears && bible.fears.length > 0
      ? ['', 'Fears:', ...bible.fears.map((fear) => `- ${fear}`)]
      : []),
    ...(bible.flaws && bible.flaws.length > 0
      ? ['', 'Flaws:', ...bible.flaws.map((flaw) => `- ${flaw}`)]
      : []),
    '',
    `Scope: ${mode === 'latest' ? 'latest play session' : 'full saga excerpt'}`,
    mode === 'full' && totalVisibleEntries > entries.length
      ? `Note: using the latest ${entries.length} of ${totalVisibleEntries} visible entries.`
      : null,
    '',
    'Chronicle entries, oldest first:',
    ...entries.map((entry) => `- ${formatPromptTimestamp(entry.timestamp)}${entryContext(entry) ? ` (${entryContext(entry)})` : ''}: ${entry.text}`),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function latestSessionTitle(entries: HistoryEntry[]): string {
  if (entries.length === 0) return 'Latest session';
  const zones = unique(entries.map((entry) => entry.zone).filter((z): z is string => Boolean(z)));
  if (zones.length === 0) return 'Latest session';
  if (zones.length === 1) return `Latest session in ${zones[0]}`;
  return `Latest session: ${zones[0]} to ${zones[zones.length - 1]}`;
}

function entryContext(entry: HistoryEntry): string {
  return [
    typeof entry.level === 'number' ? `Lvl ${entry.level}` : null,
    entry.zone,
  ]
    .filter(Boolean)
    .join(' · ');
}

function levelRange(session: ChronicleSession): string {
  if (typeof session.startLevel === 'number' && typeof session.endLevel === 'number') {
    return `Lvl ${session.startLevel} -> ${session.endLevel}`;
  }
  if (typeof session.endLevel === 'number') return `Lvl ${session.endLevel}`;
  return 'Level not captured';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function formatEntryTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateRange(start: number, end: number): string {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  if (start === end) return formatPromptTimestamp(start);
  if (sameDay) return `${formatPromptTimestamp(start)} - ${formatEntryTime(end)}`;
  return `${formatPromptTimestamp(start)} - ${formatPromptTimestamp(end)}`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatPromptTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
