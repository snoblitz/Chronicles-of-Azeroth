import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import { loadBible, clearAddonHistoryEntries, removeAddonHistoryEntriesByEventIds, deleteHistoryEntry, appendSessionRecapHistoryEntry, removeSessionRecapHistoryEntry } from '../lib/bibleStore';
import { DEV_TOOLS_ENABLED } from '../lib/devTools';
import { loadAddonEventRecords, clearAddonEventRecords, removeAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import {
  clearEnrichments,
  ENRICHMENTS_UPDATED_EVENT,
  loadEnrichments,
  removeEnrichments,
  toParagraphMap,
} from '../lib/enrichmentStore';
import {
  loadSessionRecaps,
  saveSessionRecap,
  removeSessionRecap,
  SESSION_RECAPS_UPDATED_EVENT,
  type SessionRecapMap,
  type SessionRecapRecord,
} from '../lib/sessionRecapStore';
import { entryId } from '../lib/chronicleExport';
import {
  buildChronicleSessions,
  eventFactLine,
  type ChronicleSession,
} from '../lib/sessionHistory';
import { Reveal } from './Reveal';
import ManualEntryDialog from './ManualEntryDialog';
import type { CharacterBible, HistoryEntry, LLMResponse } from '../types';

const SESSION_WINDOW_MS = 9 * 60 * 60 * 1000;

type ReaderMode = 'latest' | 'full' | 'sessions';

interface Chapter {
  id: string;
  title: string;
  entries: HistoryEntry[];
  zones: string[];
  start: number;
  end: number;
  startLevel?: number;
  endLevel?: number;
}

export function ChronicleReader() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [mode, setMode] = useState<ReaderMode>('latest');
  const [addonRecords, setAddonRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());
  const [manualOpen, setManualOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const chapterRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('at:bible-updated', onUpdate);
    return () => window.removeEventListener('at:bible-updated', onUpdate);
  }, []);

  useEffect(() => {
    const onAddonUpdate = () => setAddonRecords(loadAddonEventRecords());
    window.addEventListener('at:addon-events-updated', onAddonUpdate);
    window.addEventListener('storage', onAddonUpdate);
    return () => {
      window.removeEventListener('at:addon-events-updated', onAddonUpdate);
      window.removeEventListener('storage', onAddonUpdate);
    };
  }, []);

  useEffect(() => {
    const onModeRequest = (event: Event) => {
      const detail = (event as CustomEvent<ReaderMode>).detail;
      if (detail === 'latest' || detail === 'full' || detail === 'sessions') {
        setMode(detail);
      }
    };
    window.addEventListener('at:chronicle-mode', onModeRequest);
    return () => window.removeEventListener('at:chronicle-mode', onModeRequest);
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
  // Ghost pills (Phase 3): sessions the addon observed that haven't been
  // committed as a Chronicle chapter yet. The recap commit path writes a
  // HistoryEntry with the stable id `recap_<sessionId>`, so anything missing
  // that marker is fair game for a "write me up" CTA. Sorted oldest-first to
  // match committed-chapter order in the Arc Map.
  const ghostSessions = useMemo(() => {
    if (sessions.length === 0) return [];
    const committed = new Set<string>();
    for (const e of entries) {
      if (typeof e.id === 'string' && e.id.startsWith('recap_')) {
        committed.add(e.id.slice('recap_'.length));
      }
    }
    return sessions
      .filter((s) => !committed.has(s.id))
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [sessions, entries]);
  const latestEntries = useMemo(() => latestSessionEntries(entries), [entries]);
  const visibleEntries = mode === 'full' ? entries : latestEntries;
  const visibleChapters = useMemo(() => buildChapters(visibleEntries), [visibleEntries]);
  const insight = bible ? buildInsight(bible, visibleEntries, entries, visibleChapters.length) : null;
  const hasStoryData = entries.length > 0 || sessions.length > 0;

  // Arc Map active-pill tracking: watch each rendered chapter heading and mark
  // the most-visible one as active. The pill list highlights it so the user
  // always knows where they are in the scroll.
  useEffect(() => {
    if (mode === 'sessions') {
      setActiveChapterId(null);
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const refs = chapterRefs.current;
    if (refs.size === 0) return;

    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const id = (change.target as HTMLElement).dataset.chapterId;
          if (!id) continue;
          visibility.set(id, change.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibility) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestRatio > 0) setActiveChapterId(bestId);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of refs.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [mode, visibleChapters]);

  function scrollToChapter(chapterId: string) {
    const el = chapterRefs.current.get(chapterId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveChapterId(chapterId);
  }

  function jumpToGhostSession(sessionId: string) {
    setMode('sessions');
    // Defer to give SessionTrail a chance to mount before we ask it to scroll.
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('at:scroll-to-session', { detail: sessionId }),
      );
    });
  }

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: tab }));
  }

  if (!bible) {
    return (
      <section className="at-panel at-chronicle-reader at-chronicle-empty-shell">
        <header className="at-section-intro">
          <p className="at-kicker">✦ Story ledger</p>
          <h2 className="at-section-headline">Your Chronicle awaits</h2>
          <p className="at-section-sub">
            Select or roll a hero first. The Chronicle turns quest turn-ins, levels, zones, and manual notes
            into the story you read after a session.
          </p>
          <div className="at-section-ornament" aria-hidden="true">✦</div>
        </header>
        <div className="at-chronicle-empty-actions">
          <button className="at-btn at-btn-primary" onClick={() => requestTab('character')}>
            Choose a hero
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="at-panel at-chronicle-reader">
      <header className="at-chronicle-hero">
        <div>
          <p className="at-kicker">✦ Story ledger</p>
          <h2 className="at-section-headline">{bible.name}'s Chronicle</h2>
          <p className="at-section-sub">
            The "so what" layer: read the session, scan the arc, then generate a campfire recap when the log deserves prose.
          </p>
        </div>
        <div className="at-chronicle-hero-pills">
          <span>{bible.faction}</span>
          <span>{bible.race} {bible.class}</span>
          {typeof bible.level === 'number' && <span>Lvl {bible.level}</span>}
          {bible.currentZone && <span>{bible.currentZone}</span>}
        </div>
      </header>

      <div className="at-chronicle-modebar" role="tablist" aria-label="Chronicle view">
        <button
          className="at-btn at-btn-secondary"
          aria-pressed={mode === 'latest'}
          onClick={() => {
            setMode('latest');
          }}
        >
          Latest session
        </button>
        <button
          className="at-btn at-btn-secondary"
          aria-pressed={mode === 'full'}
          onClick={() => {
            setMode('full');
          }}
        >
          Full saga
        </button>
        <button
          className="at-btn at-btn-secondary"
          aria-pressed={mode === 'sessions'}
          onClick={() => {
            setMode('sessions');
          }}
        >
          Session trail
        </button>
        <span className="at-chronicle-modebar-spacer" />
        <button
          className="at-btn at-btn-secondary"
          onClick={() => setManualOpen(true)}
          title="Add a chronicle entry by hand"
        >
          ✦ Add manual entry
        </button>
        {scopedAddonRecords.length > 0 && (
          <PurgeChronicleButton
            characterKey={characterKey}
            characterName={bible?.name ?? null}
            recordCount={scopedAddonRecords.length}
          />
        )}
      </div>

      {!hasStoryData ? (
        <div className="at-chronicle-empty">
          <p className="at-kicker">✦ Not yet written</p>
          <h3 className="at-section-headline-sm">No story entries yet</h3>
          <p className="at-section-sub">
            Visit the <strong>Scribe's Desk</strong> tab to import your{' '}
            <code>Aftertale.lua</code> and pen Scribe's Notes from your deeds,
            or add manual entries from the character sheet.
          </p>
          <div className="at-chronicle-empty-actions" style={{ marginTop: '1rem' }}>
            <button className="at-btn at-btn-primary" onClick={() => requestTab('desk')}>
              Open Scribe's Desk
            </button>
            {DEV_TOOLS_ENABLED && (
              <button className="at-btn at-btn-secondary" onClick={() => requestTab('addon')}>
                Addon Sim
              </button>
            )}
            <button className="at-btn at-btn-secondary" onClick={() => setManualOpen(true)}>
              Add manual entry
            </button>
          </div>
        </div>
      ) : (
        <>
          {mode !== 'sessions' && insight && <InsightGrid insight={insight} mode={mode} />}

          {mode === 'sessions' ? (
            <SessionTrail
              sessions={sessions}
              bible={bible}
            />
          ) : (
            <section className="at-chronicle-book">
              <header>
                <div>
                  <p className="at-kicker">{mode === 'latest' ? 'Tonight at the table' : 'The road so far'}</p>
                  <h3>{mode === 'latest' ? latestSessionTitle(visibleEntries) : 'Full saga timeline'}</h3>
                </div>
                <span className="at-chronicle-count">{visibleChapters.length} {visibleChapters.length === 1 ? 'chapter' : 'chapters'}</span>
              </header>

              {visibleChapters.length === 0 ? (
                <p className="muted">No entries fall inside the latest-session window. Switch to Full saga or Session trail.</p>
              ) : (
                <div className="at-chronicle-chapters">
                  {visibleChapters.map((chapter, i) => (
                    <Reveal key={chapter.id}>
                      <article
                        className="at-chronicle-chapter"
                        data-chapter-id={chapter.id}
                        ref={(el) => {
                          if (el) chapterRefs.current.set(chapter.id, el);
                          else chapterRefs.current.delete(chapter.id);
                        }}
                      >
                        <div className="at-chronicle-chapter-head">
                          <span className="at-chronicle-chapter-num">Chapter {i + 1}</span>
                          <h4>{chapter.title}</h4>
                          <span>{formatDateRange(chapter.start, chapter.end)}</span>
                          {characterKey && (
                            <PurgeChapterButton
                              chapter={chapter}
                              characterKey={characterKey}
                              chapterNumber={i + 1}
                            />
                          )}
                        </div>
                        <ol>
                          {chapter.entries.map((entry) => (
                            <li key={entry.id}>
                              <span>{formatEntryTime(entry.timestamp)}</span>
                              <div className="at-chronicle-entry-body">
                                {renderEntryParagraphs(entry.text)}
                              </div>
                              {entryContext(entry) && <small>{entryContext(entry)}</small>}
                            </li>
                          ))}
                        </ol>
                      </article>
                    </Reveal>
                  ))}
                </div>
              )}
            </section>
          )}

          {mode !== 'sessions' && (visibleChapters.length > 0 || ghostSessions.length > 0) && (
            <section className="at-chronicle-arc-map">
              <p className="at-kicker">Arc map</p>
              <div>
                {visibleChapters.map((chapter, i) => {
                  const isActive = activeChapterId === chapter.id;
                  const prev = visibleChapters[i - 1];
                  const levelGained =
                    prev && typeof prev.endLevel === 'number' && typeof chapter.startLevel === 'number'
                      ? chapter.startLevel - prev.endLevel
                      : 0;
                  return (
                    <Fragment key={chapter.id}>
                      {levelGained > 0 && (
                        <span
                          className="at-arc-levelup"
                          title={`Leveled ${prev?.endLevel} → ${chapter.startLevel} between chapters`}
                          aria-hidden="true"
                        >
                          ⬆ Lvl {chapter.startLevel}
                        </span>
                      )}
                      <button
                        type="button"
                        className={`at-arc-pill${isActive ? ' is-active' : ''}`}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => scrollToChapter(chapter.id)}
                      >
                        {i + 1}. {chapter.title}
                      </button>
                    </Fragment>
                  );
                })}
                {ghostSessions.length > 0 && (
                  <>
                    {visibleChapters.length > 0 && (
                      <span className="at-arc-divider" aria-hidden="true">·</span>
                    )}
                    {ghostSessions.map((session) => {
                      const zone = session.endZone ?? session.startZone ?? 'The road';
                      const lvl =
                        typeof session.endLevel === 'number'
                          ? ` · Lvl ${session.endLevel}`
                          : '';
                      return (
                        <button
                          key={`ghost_${session.id}`}
                          type="button"
                          className="at-arc-pill at-arc-ghost"
                          onClick={() => jumpToGhostSession(session.id)}
                          title="Un-penned session — jump to Session Trail to recap it"
                        >
                          ✎ {zone}{lvl}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {bible && (
        <ManualEntryDialog
          bible={bible}
          open={manualOpen}
          onClose={() => setManualOpen(false)}
        />
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
        title: entry.title?.trim() || zone,
        entries: [entry],
        zones: [zone],
        start: entry.timestamp,
        end: entry.timestamp,
        startLevel: typeof entry.level === 'number' ? entry.level : undefined,
        endLevel: typeof entry.level === 'number' ? entry.level : undefined,
      });
      continue;
    }
    last.entries.push(entry);
    last.end = entry.timestamp;
    if (typeof entry.level === 'number') {
      if (typeof last.startLevel !== 'number') last.startLevel = entry.level;
      last.endLevel = entry.level;
    }
    // Promote a richer title if this entry has one and the chapter is still
    // using its zone fallback.
    if (entry.title?.trim() && last.title === zone) {
      last.title = entry.title.trim();
    }
  }
  return chapters;
}

function buildInsight(bible: CharacterBible, visibleEntries: HistoryEntry[], allEntries: HistoryEntry[], chapterCount: number) {
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
    chapters: chapterCount,
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
      ? `The next NPC should remember this: ${summarizeForHook(last.text)}`
      : 'Pen a session recap from Session Trail, then this becomes a living story hook.',
  };
}

function summarizeForHook(raw: string, maxChars = 180): string {
  const cleaned = cleanRecapText(raw).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  // Prefer cutting at a sentence boundary.
  const sliced = cleaned.slice(0, maxChars);
  const lastStop = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  if (lastStop > maxChars * 0.5) return sliced.slice(0, lastStop + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trimEnd() + '…';
}

// Strip the LLM's markdown formatting before we display the recap as a
// chronicle chapter. The model loves to lead with a `# Title` line and bold
// the "So what changed" bullet header — both look like garbage when rendered
// as plain text in the chapter list.
export function cleanRecapText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').trim();
  // Drop a leading "# Title" line (and the blank line after it). The chapter
  // already has its own title (either auto-extracted from this line, or
  // zone-based as a fallback) so we don't want it inline.
  text = text.replace(/^#{1,6}\s+[^\n]*\n+/, '');
  // Convert **bold** / __bold__ to plain text.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1');
  // Convert *em* / _em_ to plain text (avoid eating bullet markers).
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2');
  // Normalize bullet lines so they render cleanly when paragraph-split.
  text = text.replace(/^[ \t]*[-*•][ \t]+/gm, '• ');
  // Defang em/en dashes and double-hyphens that the model loves to scatter
  // around. Sentence break ("X — Y") becomes ", "; mid-word ("9–11") becomes
  // a single hyphen.
  text = text.replace(/\s+[—–]\s+/g, ', ');
  text = text.replace(/[—–]/g, '-');
  text = text.replace(/\s+--\s+/g, ', ');
  // Collapse 3+ blank lines into a single paragraph break.
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// Pull the first `# Title` line out of a raw recap, if present. Returns the
// title without the leading hashes. Used so committed session recaps can set
// the chapter banner to something narrative ("The Quartermaster's Ledger")
// rather than just the zone name ("Anvilmar").
export function extractRecapTitle(raw: string): string | null {
  const m = raw.replace(/\r\n/g, '\n').trimStart().match(/^#{1,6}\s+([^\n]+)/);
  if (!m) return null;
  const title = m[1].trim().replace(/[—–]/g, '-');
  return title || null;
}

function renderEntryParagraphs(raw: string) {
  const text = cleanRecapText(raw);
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length === 0) return <p>{text}</p>;
  let leadApplied = false;
  const renderPlainPara = (content: string, key: number) => {
    if (leadApplied) return <p key={key}>{content}</p>;
    leadApplied = true;
    const m = content.match(/^(\S+)(\s+)([\s\S]*)$/);
    if (!m) return <p key={key}><span className="at-entry-leadword">{content}</span></p>;
    const [, lead, gap, rest] = m;
    return (
      <p key={key}>
        <span className="at-entry-leadword">{lead}</span>{gap}{rest}
      </p>
    );
  };
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const bulletLines = lines.filter((l) => l.startsWith('• '));
        const isBulletBlock = bulletLines.length > 0 && bulletLines.length === lines.length;
        if (isBulletBlock) {
          return (
            <ul key={i} className="at-entry-bullets">
              {bulletLines.map((line, li) => (
                <li key={li}>{line.replace(/^•\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        if (lines.length === 1 && lines[0].length < 60 && lines[0].endsWith(':')) {
          return <p key={i} className="at-entry-label">{lines[0]}</p>;
        }
        if (lines.length > 1) {
          // Multi-line non-bullet block; only apply lead-word to the very first line.
          const [firstLine, ...rest] = lines;
          if (!leadApplied) {
            leadApplied = true;
            const m = firstLine.match(/^(\S+)(\s+)([\s\S]*)$/);
            const head = m ? (
              <>
                <span className="at-entry-leadword">{m[1]}</span>{m[2]}{m[3]}
              </>
            ) : (
              <span className="at-entry-leadword">{firstLine}</span>
            );
            return (
              <p key={i}>
                {head}
                {rest.map((line, li) => (
                  <span key={li}><br />{line}</span>
                ))}
              </p>
            );
          }
          return (
            <p key={i}>
              {lines.map((line, li) => (
                <span key={li}>
                  {line}
                  {li < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          );
        }
        return renderPlainPara(lines[0], i);
      })}
    </>
  );
}

function InsightGrid({
  insight,
  mode,
}: {
  insight: ReturnType<typeof buildInsight>;
  mode: ReaderMode;
}) {
  return (
    <div className="at-chronicle-insights">
      <article>
        <span>Session shape</span>
        <strong>{insight.chapters} {insight.chapters === 1 ? 'chapter' : 'chapters'}</strong>
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
          'You are the in-world chronicler for Aftertale.',
          'Write polished story prose from structured character-history notes.',
          'Use only the provided facts. Do not invent completed quests, locations, NPC relationships, or outcomes.',
          'Keep the hero as the subject. Do not mention prompts, models, localStorage, UI tabs, or the app.',
          '',
          'STYLE RULES (strict):',
          '- Never use em dashes (—) or en dashes (–). If you would reach for one, use a comma, semicolon, or period instead. Two hyphens (--) are also forbidden.',
          '- Avoid ellipses unless quoting a character. No "..." for dramatic pauses.',
          '- Avoid the cliche "not X, but Y" construction. Vary sentence rhythm.',
          '- Prefer concrete nouns and verbs over abstract sentiment. Show, don\'t narrate the feeling.',
          '',
          'OUTPUT FORMAT (strict):',
          '- Line 1: a single chapter title in the form `# <Title>`. The title must be 3 to 7 words drawn from the actual events of THIS session (the specific NPC, item, deed, or beat that defines it). Do NOT use the zone name alone, do NOT use generic phrases like "A Day\'s Work" or "Coldridge Errands".',
          '- One blank line.',
          '- 3 to 5 short paragraphs of prose, each separated by a blank line.',
          '- One blank line.',
          '- A final closing section. Use the heading `What lingers:` on its own line, then 2 to 3 short bullets starting with `- `. Each bullet is one sentence about what this session leaves with the hero: a debt, a question, a face they will see again, a small change in how they carry themselves. Do NOT use "So what changed".',
        ].join('\n'),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
}

function SessionTrail({
  sessions,
  bible,
}: {
  sessions: ChronicleSession[];
  bible: CharacterBible;
}) {
  const [modelIdx] = useSelectedModelIdx();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessions[0]?.id ?? null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const characterKey = String(bible.createdAt);
  const [sessionRecaps, setSessionRecaps] = useState<SessionRecapMap>(() =>
    loadSessionRecaps(characterKey),
  );
  useEffect(() => {
    setSessionRecaps(loadSessionRecaps(characterKey));
    const refresh = () => setSessionRecaps(loadSessionRecaps(characterKey));
    window.addEventListener(SESSION_RECAPS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_RECAPS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [characterKey]);

  const committedRecapIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of bible.history ?? []) {
      if (typeof e.id === 'string' && e.id.startsWith('recap_')) {
        ids.add(e.id.slice('recap_'.length));
      }
    }
    return ids;
  }, [bible.history]);

  const [enrichments, setEnrichments] = useState<Record<string, string>>(() =>
    toParagraphMap(loadEnrichments(characterKey)),
  );
  useEffect(() => {
    setEnrichments(toParagraphMap(loadEnrichments(characterKey)));
    const refresh = () => setEnrichments(toParagraphMap(loadEnrichments(characterKey)));
    window.addEventListener(ENRICHMENTS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ENRICHMENTS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [characterKey]);

  function requestTab(tab: string) {
    window.dispatchEvent(new CustomEvent('at:request-tab', { detail: tab }));
  }

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      // Prefer the most recent session that actually has enriched prose, so
      // landing here from Scribe's Desk lands on something visible. Falls back
      // to the latest session if nothing is enriched yet.
      const firstEnriched = sessions.find((s) =>
        s.records.some((r) => enrichments[entryId(r.event)]),
      );
      setSelectedSessionId((firstEnriched ?? sessions[0]).id);
    }
  }, [sessions, selectedSessionId, enrichments]);

  // Listen for Arc Map ghost-pill clicks: select the requested session and
  // scroll its card into view. Defers scroll to next frame so the <details>
  // open state lands before scrollIntoView.
  useEffect(() => {
    const onScrollRequest = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail;
      if (!targetId || !sessions.some((s) => s.id === targetId)) return;
      setSelectedSessionId(targetId);
      requestAnimationFrame(() => {
        document.getElementById(`at-session-${targetId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    };
    window.addEventListener('at:scroll-to-session', onScrollRequest);
    return () => window.removeEventListener('at:scroll-to-session', onScrollRequest);
  }, [sessions]);

  function jumpToEnrichedSession() {
    const target = sessions.find((s) => s.records.some((r) => enrichments[entryId(r.event)]));
    if (!target) return;
    setSelectedSessionId(target.id);
    // Defer to next frame so the <details open> re-render lands before scroll.
    requestAnimationFrame(() => {
      document.getElementById(`at-session-${target.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  async function generateSelectedSessionRecap(session: ChronicleSession) {
    setBusySessionId(session.id);
    setSessionError(null);
    try {
      const res = await requestCampfireRecap(modelIdx, buildSessionRecapPrompt(bible, session));
      saveSessionRecap(characterKey, session.id, {
        text: res.text,
        savedAt: Date.now(),
        modelId: res.model,
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySessionId(null);
    }
  }

  function commitRecapToChronicle(session: ChronicleSession) {
    const recap = sessionRecaps[session.id];
    if (!recap) return;
    const title = extractRecapTitle(recap.text);
    appendSessionRecapHistoryEntry(
      session.id,
      cleanRecapText(recap.text),
      session.startedAt,
      session.endZone ?? session.startZone,
      session.endLevel ?? session.startLevel,
      title ?? undefined,
    );
  }

  function removeRecapFromChronicle(session: ChronicleSession) {
    removeSessionRecapHistoryEntry(session.id);
  }

  function discardRecap(session: ChronicleSession) {
    removeSessionRecap(characterKey, session.id);
    removeSessionRecapHistoryEntry(session.id);
  }

  return (
    <section className="at-chronicle-book at-session-trail">
      <header>
        <div>
          <p className="at-kicker">Session history</p>
          <h3>The trail by play session</h3>
        </div>
        <span className="at-chronicle-count">{sessions.length} sessions</span>
      </header>

      {sessions.length === 0 ? (
        <p className="muted">
          No addon-observed sessions yet. Import your <code>Aftertale.lua</code> from the Scribe's Desk to populate them.
        </p>
      ) : (
        <div className="at-session-list">
          {(() => {
            const totalEvents = sessions.reduce((sum, s) => sum + s.records.length, 0);
            const enrichedHere = sessions.reduce(
              (sum, s) =>
                sum + s.records.filter((r) => enrichments[entryId(r.event)]).length,
              0,
            );
            if (totalEvents === 0) return null;
            if (enrichedHere === totalEvents) {
              return (
                <div className="at-chronicle-enrich-nudge at-chronicle-enrich-nudge-done" role="status">
                  <span className="at-enriched-chip" aria-hidden="true">✦ Scribe’s Note</span>
                  <span>
                    All {totalEvents} addon-observed facts have a Scribe’s Note.
                  </span>
                </div>
              );
            }
            return (
              <div className="at-chronicle-enrich-nudge" role="status">
                <span>
                  <strong>{enrichedHere}</strong> of <strong>{totalEvents}</strong> addon-observed facts have a Scribe’s Note.
                </span>
                <span className="at-chronicle-enrich-nudge-actions">
                  {enrichedHere > 0 && (
                    <button
                      type="button"
                      className="at-btn at-btn-primary"
                      onClick={jumpToEnrichedSession}
                    >
                      Jump to scribed session ↓
                    </button>
                  )}
                  <button
                    type="button"
                    className="at-btn at-btn-secondary"
                    onClick={() => requestTab('desk')}
                  >
                    Open Scribe's Desk →
                  </button>
                </span>
              </div>
            );
          })()}
          {sessions.map((session) => (
            <details
              key={session.id}
              id={`at-session-${session.id}`}
              className="at-session-card"
              open={selectedSessionId === session.id}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setSelectedSessionId(session.id);
                  setSessionError(null);
                }}
              >
                <div>
                  <span className="at-chronicle-chapter-num">{session.isOpen ? 'Active session' : 'Closed session'}</span>
                  <h4>{session.title}</h4>
                  <p>
                    {formatDateRange(session.startedAt, session.finishedAt)}
                    {' · '}
                    {formatDuration(session.finishedAt - session.startedAt)}
                  </p>
                </div>
                <div className="at-session-card-summary-right">
                  <strong>{session.stats.questsCompleted} quests · +{session.stats.levelsGained} levels</strong>
                  {committedRecapIds.has(session.id) && (
                    <span className="at-session-scribed-badge" title="A chapter from this session lives in the Chronicle">
                      ✦ In Chronicle
                    </span>
                  )}
                  <PurgeSessionButton
                    session={session}
                    characterKey={characterKey}
                  />
                </div>
              </summary>

              <section className="at-session-campfire-hero">
                <div className="at-session-campfire-head">
                  <div>
                    <p className="at-kicker">✒ At the scribe's desk</p>
                    <h4>Ink this chapter into the chronicle</h4>
                    <p className="muted">
                      The scribe will draw from this session's observed facts and pen a proper chapter — title, prose, and a closing reflection.
                    </p>
                  </div>
                  <div className="at-chronicle-generate-controls">
                    <button
                      className="at-btn at-btn-primary"
                      onClick={() => generateSelectedSessionRecap(session)}
                      disabled={Boolean(busySessionId)}
                    >
                      {busySessionId === session.id
                        ? 'Dipping the quill…'
                        : sessionRecaps[session.id]
                          ? '✒ Re-pen this chapter'
                          : '✒ Pen this chapter'}
                    </button>
                  </div>
                </div>

                {sessionError && selectedSessionId === session.id && (
                  <div className="at-callout-danger at-chronicle-error">
                    <strong>The quill slipped:</strong> {sessionError}
                  </div>
                )}

                {sessionRecaps[session.id] ? (
                  <SavedSessionRecapArticle
                    record={sessionRecaps[session.id]}
                    committed={committedRecapIds.has(session.id)}
                    onCommit={() => commitRecapToChronicle(session)}
                    onUncommit={() => removeRecapFromChronicle(session)}
                    onDiscard={() => discardRecap(session)}
                  />
                ) : (
                  <p className="at-session-campfire-empty">
                    The parchment is still blank. Press the quill above and the scribe will spin these observed facts into a proper chapter — a title, a few paragraphs, and a closing "and so it changed."
                  </p>
                )}
              </section>

              <div className="at-session-stats">
                <article>
                  <span>The hours kept</span>
                  <strong>
                    {formatEntryTime(session.startedAt)} → {session.isOpen ? 'quill still in hand' : formatEntryTime(session.finishedAt)}
                  </strong>
                  <p>{formatDuration(session.finishedAt - session.startedAt)}</p>
                </article>
                <article>
                  <span>Levels earned</span>
                  <strong>{levelRange(session)}</strong>
                  <p>{session.stats.levelsGained > 0 ? `${session.stats.levelsGained} level gains observed` : 'No level-up delta observed'}</p>
                </article>
                <article>
                  <span>Errands run</span>
                  <strong>{session.stats.questsCompleted} completed</strong>
                  <p>{session.stats.questsAccepted} accepted during the session</p>
                </article>
                <article>
                  <span>Road hazards</span>
                  <strong>{session.stats.deaths} deaths</strong>
                  <p>{session.stats.kills} notable kills · {session.stats.npcsMet} NPCs met</p>
                </article>
              </div>

              <div className="at-session-meta">
                <span>Zones traveled: {session.stats.zonesVisited.length > 0 ? session.stats.zonesVisited.join(' → ') : 'none recorded'}</span>
                {session.stats.notableItems.length > 0 && <span>Items: {session.stats.notableItems.join(', ')}</span>}
                {session.stats.notableUnits.length > 0 && <span>Foes: {session.stats.notableUnits.join(', ')}</span>}
              </div>

              <SessionMarginNotes session={session} enrichments={enrichments} />
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
    bible.coreQuote ? `Hero's truth: ${bible.coreQuote}` : null,
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

// ----------------------------------------------------------------------------
// Inline purge controls — double-confirm, no permanent surface noise.
// Both share a 4-second auto-disarm.
// ----------------------------------------------------------------------------

function PurgeChronicleButton({
  characterKey,
  characterName,
  recordCount,
}: {
  characterKey: string | null;
  characterName: string | null;
  recordCount: number;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!characterKey) return null;

  return (
    <button
      type="button"
      className={`at-btn at-btn-danger at-btn-sm${armed ? ' at-btn-danger-armed' : ''}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        clearAddonEventRecords(characterKey);
        clearEnrichments(characterKey);
        clearAddonHistoryEntries();
        setArmed(false);
      }}
      title={
        armed
          ? 'Click again to confirm. Manual entries are preserved.'
          : `Purge all ${recordCount} addon-observed events${characterName ? ` for ${characterName}` : ''} (manual entries kept)`
      }
    >
      {armed ? '⚠ Click again to purge' : '✕ Purge chronicle'}
    </button>
  );
}

function PurgeSessionButton({
  session,
  characterKey,
}: {
  session: ChronicleSession;
  characterKey: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`at-btn at-btn-danger at-btn-sm at-session-purge${armed ? ' at-btn-danger-armed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!armed) {
          setArmed(true);
          return;
        }
        const eventIds = session.records.map((r) => r.event.id);
        const enrichmentIds = session.records.map((r) => entryId(r.event));
        removeAddonEventRecords(eventIds);
        removeEnrichments(characterKey, enrichmentIds);
        removeAddonHistoryEntriesByEventIds(eventIds);
        removeSessionRecap(characterKey, session.id);
        removeSessionRecapHistoryEntry(session.id);
        setArmed(false);
      }}
      title={
        armed
          ? 'Click again to confirm — this session only'
          : `Purge this session (${session.records.length} event${session.records.length === 1 ? '' : 's'})`
      }
      aria-label={armed ? 'Confirm purge this session' : 'Purge this session'}
    >
      {armed ? '⚠ Confirm' : '✕'}
    </button>
  );
}

function PurgeChapterButton({
  chapter,
  characterKey,
  chapterNumber,
}: {
  chapter: Chapter;
  characterKey: string;
  chapterNumber: number;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const { addonEventIds, manualEntryIds } = useMemo(() => {
    const addon: string[] = [];
    const manual: string[] = [];
    for (const entry of chapter.entries) {
      if (typeof entry.id !== 'string') continue;
      if (entry.id.startsWith('addon_')) addon.push(entry.id.slice('addon_'.length));
      else manual.push(entry.id);
    }
    return { addonEventIds: addon, manualEntryIds: manual };
  }, [chapter.entries]);

  const total = addonEventIds.length + manualEntryIds.length;
  if (total === 0) return null;

  return (
    <button
      type="button"
      className={`at-btn at-btn-danger at-btn-sm at-session-purge${armed ? ' at-btn-danger-armed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!armed) {
          setArmed(true);
          return;
        }
        if (addonEventIds.length > 0) {
          removeAddonEventRecords(addonEventIds);
          removeEnrichments(characterKey, addonEventIds);
          removeAddonHistoryEntriesByEventIds(addonEventIds);
        }
        for (const id of manualEntryIds) deleteHistoryEntry(id);
        setArmed(false);
      }}
      title={
        armed
          ? `Click again to confirm — wipes Chapter ${chapterNumber} (${total} entr${total === 1 ? 'y' : 'ies'})`
          : `Purge Chapter ${chapterNumber} (${total} entr${total === 1 ? 'y' : 'ies'}${manualEntryIds.length > 0 ? ` — includes ${manualEntryIds.length} manual` : ''})`
      }
      aria-label={armed ? `Confirm purge Chapter ${chapterNumber}` : `Purge Chapter ${chapterNumber}`}
    >
      {armed ? '⚠ Confirm' : '✕'}
    </button>
  );
}

const KIND_LABEL: Record<string, string> = {
  session_start: 'Logins',
  session_end: 'Logouts',
  player_death: 'Deaths',
  quest_accepted: 'Quests accepted',
  quest_turned_in: 'Quests turned in',
  quest_objective_progress: 'Quest progress',
  quest_detail: 'Quest details',
  zone_changed: 'Zone changes',
  level_up: 'Level-ups',
  unit_kill: 'Kills',
  gossip_show: 'Gossip',
  unknown: 'Chatter',
};

function SavedSessionRecapArticle({
  record,
  committed,
  onCommit,
  onUncommit,
  onDiscard,
}: {
  record: SessionRecapRecord;
  committed: boolean;
  onCommit: () => void;
  onUncommit: () => void;
  onDiscard: () => void;
}) {
  const cleaned = cleanRecapText(record.text);
  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const savedWhen = new Date(record.savedAt);
  return (
    <article className="at-chronicle-article at-session-campfire-article">
      <div className="at-session-recap-body">
        {paragraphs.length > 0 ? (
          paragraphs.map((para, i) => <p key={i}>{para}</p>)
        ) : (
          <p>{cleaned}</p>
        )}
      </div>
      <footer className="at-session-recap-footer">
        <div className="at-session-recap-meta">
          <span>Penned {savedWhen.toLocaleString()}</span>
          {record.modelId && <span>· {record.modelId}</span>}
          {committed && <span className="at-session-recap-committed">· ✦ In the Chronicle</span>}
        </div>
        <div className="at-session-recap-actions">
          {committed ? (
            <button type="button" className="at-btn at-btn-ghost" onClick={onUncommit}>
              ✕ Remove from Chronicle
            </button>
          ) : (
            <button type="button" className="at-btn at-btn-primary" onClick={onCommit}>
              ✒ Add to Chronicle
            </button>
          )}
          <button type="button" className="at-btn at-btn-ghost" onClick={onDiscard} title="Discard this draft and any committed chapter">
            Discard draft
          </button>
        </div>
      </footer>
    </article>
  );
}

function SessionMarginNotes({
  session,
  enrichments,
}: {
  session: ChronicleSession;
  enrichments: Record<string, string>;
}) {
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [scribedOnly, setScribedOnly] = useState(false);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of session.records) {
      counts[r.event.kind] = (counts[r.event.kind] || 0) + 1;
    }
    return counts;
  }, [session.records]);

  const kindsPresent = useMemo(
    () => Object.keys(kindCounts).sort((a, b) => kindCounts[b] - kindCounts[a]),
    [kindCounts],
  );

  const scribedCount = useMemo(
    () => session.records.filter((r) => Boolean(enrichments[entryId(r.event)])).length,
    [session.records, enrichments],
  );

  const filtered = useMemo(() => {
    return session.records.filter((r) => {
      if (selectedKinds.size > 0 && !selectedKinds.has(r.event.kind)) return false;
      if (scribedOnly && !enrichments[entryId(r.event)]) return false;
      return true;
    });
  }, [session.records, selectedKinds, scribedOnly, enrichments]);

  const toggleKind = (kind: string) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const clearAll = () => {
    setSelectedKinds(new Set());
    setScribedOnly(false);
  };

  const hasFilters = selectedKinds.size > 0 || scribedOnly;

  return (
    <details className="at-session-events">
      <summary className="at-session-events-summary">
        <span className="at-kicker">Margin notes from the addon</span>
        <span className="at-session-events-count">
          {hasFilters ? `${filtered.length} / ${session.records.length}` : session.records.length}
        </span>
      </summary>

      <div className="at-session-event-filters" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`at-pill ${!hasFilters ? 'at-pill-active' : ''}`}
          onClick={clearAll}
        >
          All ({session.records.length})
        </button>
        {scribedCount > 0 && (
          <button
            type="button"
            className={`at-pill at-pill-scribed ${scribedOnly ? 'at-pill-active' : ''}`}
            onClick={() => setScribedOnly((v) => !v)}
            title="Show only entries with a Scribe's Note"
          >
            ✦ Scribe's notes ({scribedCount})
          </button>
        )}
        {kindsPresent.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`at-pill ${selectedKinds.has(kind) ? 'at-pill-active' : ''}`}
            onClick={() => toggleKind(kind)}
          >
            {KIND_LABEL[kind] ?? kind} ({kindCounts[kind]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="at-session-events-empty">No notes match this filter.</p>
      ) : (
        <ol>
          {filtered.map((record) => {
            const prose = enrichments[entryId(record.event)];
            return (
              <li key={record.event.id} className={prose ? 'at-session-event-enriched' : undefined}>
                <span>{formatEntryTime(record.event.timestamp)}</span>
                {prose ? (
                  <div className="at-enriched-block">
                    <p className="at-enriched-prose">{prose}</p>
                    <small className="at-enriched-fact">{eventFactLine(record.event)}</small>
                    <span className="at-enriched-chip" title="Generated at the Scribe's Desk">
                      ✦ Scribe’s Note
                    </span>
                  </div>
                ) : (
                  <p>{eventFactLine(record.event)}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}


