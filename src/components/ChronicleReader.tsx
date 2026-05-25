import { useEffect, useMemo, useState } from 'react';
import { ModelPicker } from './ModelPicker';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { loadBible } from '../lib/bibleStore';
import type { CharacterBible, HistoryEntry, LLMResponse } from '../types';

const SESSION_WINDOW_MS = 9 * 60 * 60 * 1000;
const FULL_RECAP_ENTRY_LIMIT = 40;

type ReaderMode = 'latest' | 'full';

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

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('coa:bible-updated', onUpdate);
    return () => window.removeEventListener('coa:bible-updated', onUpdate);
  }, []);

  const entries = useMemo(
    () => [...(bible?.history ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [bible],
  );
  const latestEntries = useMemo(() => latestSessionEntries(entries), [entries]);
  const visibleEntries = mode === 'latest' ? latestEntries : entries;
  const chapters = useMemo(() => buildChapters(entries), [entries]);
  const visibleChapters = useMemo(() => buildChapters(visibleEntries), [visibleEntries]);
  const insight = bible ? buildInsight(bible, visibleEntries, entries) : null;

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('coa:request-tab', { detail: tab }));
  }

  async function generateRecap() {
    if (!bible || visibleEntries.length === 0) return;
    setBusy(true);
    setError(null);
    setRecap(null);
    try {
      const choice = MODEL_CHOICES[modelIdx];
      const provider = await choice.factory();
      const scopedEntries =
        mode === 'latest'
          ? visibleEntries
          : visibleEntries.slice(-FULL_RECAP_ENTRY_LIMIT);
      const res = await provider.chat({
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
            content: buildRecapPrompt(bible, scopedEntries, mode, visibleEntries.length),
          },
        ],
      });
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
      </div>

      {entries.length === 0 ? (
        <div className="coa-chronicle-empty">
          <h3>No story entries yet</h3>
          <p className="muted">
            Run the Addon Sim, turn in quests from the future addon bridge, or add manual deeds from the character sheet.
          </p>
          <div className="coa-chronicle-empty-actions">
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
          {insight && <InsightGrid insight={insight} mode={mode} />}

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

          {error && (
            <div className="coa-callout-danger coa-chronicle-error">
              <strong>Recap failed:</strong> {error}
            </div>
          )}

          {recap && (
            <article className="coa-chronicle-recap">
              <span className="coa-bubble-label">CAMPFIRE RECAP</span>
              <div>{recap.text}</div>
              <footer>
                {recap.inputTokens} in / {recap.cachedInputTokens} cached / {recap.outputTokens} out ·{' '}
                {recap.latencyMs.toFixed(0)}ms · {recap.model}
              </footer>
            </article>
          )}

          <section className="coa-chronicle-book">
            <header>
              <div>
                <p className="coa-kicker">{mode === 'latest' ? 'Tonight at the table' : 'The road so far'}</p>
                <h3>{mode === 'latest' ? latestSessionTitle(visibleEntries) : 'Full saga timeline'}</h3>
              </div>
              <span className="coa-chronicle-count">{visibleEntries.length} deeds</span>
            </header>

            {visibleChapters.length === 0 ? (
              <p className="muted">No entries fall inside the latest-session window. Switch to Full saga.</p>
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

          {chapters.length > 0 && (
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

function formatPromptTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
