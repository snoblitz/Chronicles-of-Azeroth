import { useEffect, useMemo, useState } from 'react';
import { CLASSIC_QUEST_CHAINS } from '../lib/classicQuestFixtures';
import {
  createSimulatorEvent,
  createSimulatorSessionEvent,
  formatEventLabel,
  type AddonEvent,
  type AddonEventTemplate,
  type SimulatorEventOptions,
  type QuestChainFixture,
  type QuestStepFixture,
} from '../lib/addonEvents';
import { ingestAddonEvent } from '../lib/addonIngest';
import {
  clearAddonEventRecords,
  loadAddonEventRecords,
  type AddonEventRecord,
} from '../lib/addonEventStore';
import { loadBible } from '../lib/bibleStore';
import type { CharacterBible } from '../types';

interface Cursor {
  stepIndex: number;
  eventIndex: number;
}

export function AddonSimulator() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [chainId, setChainId] = useState(CLASSIC_QUEST_CHAINS[0]?.id ?? '');
  const [cursor, setCursor] = useState<Cursor>({ stepIndex: 0, eventIndex: 0 });
  const [records, setRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());
  const [questTextByStep, setQuestTextByStep] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const refreshBible = () => setBible(loadBible());
    window.addEventListener('at:bible-updated', refreshBible);
    return () => window.removeEventListener('at:bible-updated', refreshBible);
  }, []);

  useEffect(() => {
    const refreshRecords = () => setRecords(loadAddonEventRecords());
    window.addEventListener('at:addon-events-updated', refreshRecords);
    window.addEventListener('storage', refreshRecords);
    return () => {
      window.removeEventListener('at:addon-events-updated', refreshRecords);
      window.removeEventListener('storage', refreshRecords);
    };
  }, []);

  const chain = useMemo(
    () => CLASSIC_QUEST_CHAINS.find((c) => c.id === chainId) ?? CLASSIC_QUEST_CHAINS[0],
    [chainId],
  );

  const currentStep = chain?.steps[cursor.stepIndex] ?? chain?.steps[0] ?? null;
  const currentTemplate = currentStep?.events[cursor.eventIndex] ?? null;
  const activeCharacterKey = bible ? String(bible.createdAt) : undefined;
  const scopedRecords = activeCharacterKey
    ? records.filter((r) => r.characterKey === activeCharacterKey)
    : records;

  function selectChain(nextId: string) {
    setChainId(nextId);
    setCursor({ stepIndex: 0, eventIndex: 0 });
    setLastResult(null);
  }

  function questTextFor(step: QuestStepFixture): string {
    return questTextByStep[step.stepId] ?? '';
  }

  function setQuestText(step: QuestStepFixture, text: string) {
    setQuestTextByStep((m) => ({ ...m, [step.stepId]: text }));
  }

  function ingestTemplate(
    selectedChain: QuestChainFixture,
    selectedStep: QuestStepFixture,
    template: AddonEventTemplate,
    options: SimulatorEventOptions = {},
  ): AddonEvent {
    const event = createSimulatorEvent(
      selectedChain,
      selectedStep,
      template,
      questTextFor(selectedStep),
      options,
    );
    const result = ingestAddonEvent(event);
    setLastResult(`${formatEventLabel(event)} — ${result.message}`);
    return event;
  }

  function advanceCursor(from: Cursor, selectedChain: QuestChainFixture): Cursor {
    const step = selectedChain.steps[from.stepIndex];
    if (!step) return { stepIndex: 0, eventIndex: 0 };
    const nextEventIndex = from.eventIndex + 1;
    if (nextEventIndex < step.events.length) {
      return { stepIndex: from.stepIndex, eventIndex: nextEventIndex };
    }
    const nextStepIndex = from.stepIndex + 1;
    if (nextStepIndex < selectedChain.steps.length) {
      return { stepIndex: nextStepIndex, eventIndex: 0 };
    }
    return { stepIndex: selectedChain.steps.length - 1, eventIndex: step.events.length };
  }

  function emitNextEvent() {
    if (!chain || !currentStep || !currentTemplate) return;
    ingestTemplate(chain, currentStep, currentTemplate, { sessionId: currentSessionId ?? undefined });
    setCursor((c) => advanceCursor(c, chain));
  }

  function emitCurrentStep() {
    if (!chain || !currentStep) return;
    for (const template of currentStep.events) {
      ingestTemplate(chain, currentStep, template, { sessionId: currentSessionId ?? undefined });
    }
    setCursor((c) => ({
      stepIndex: Math.min(c.stepIndex + 1, chain.steps.length - 1),
      eventIndex: 0,
    }));
  }

  function resetScenario() {
    setCursor({ stepIndex: 0, eventIndex: 0 });
    setLastResult(null);
  }

  function startSession() {
    if (currentSessionId) return;
    const sessionId = `sim_session_${Date.now().toString(36)}`;
    const event = createSimulatorSessionEvent('session_start', bible, sessionId);
    const result = ingestAddonEvent(event);
    setCurrentSessionId(sessionId);
    setLastResult(`${formatEventLabel(event)} — ${result.message}`);
  }

  function endSession() {
    if (!currentSessionId) return;
    const event = createSimulatorSessionEvent('session_end', bible, currentSessionId);
    const result = ingestAddonEvent(event);
    setCurrentSessionId(null);
    setLastResult(`${formatEventLabel(event)} — ${result.message}`);
  }

  function emitDeath() {
    const sessionId = currentSessionId ?? `sim_session_${Date.now().toString(36)}`;
    const event = createSimulatorSessionEvent('player_death', bible, sessionId);
    const result = ingestAddonEvent(event);
    if (!currentSessionId) setCurrentSessionId(sessionId);
    setLastResult(`${formatEventLabel(event)} — ${result.message}`);
  }

  function emitFullChainSession() {
    if (!chain) return;
    const sessionId = `sim_session_${Date.now().toString(36)}`;
    let timestamp = Date.now();
    ingestAddonEvent(createSimulatorSessionEvent('session_start', bible, sessionId, timestamp));
    for (const step of chain.steps) {
      for (const template of step.events) {
        timestamp += 60_000;
        ingestTemplate(chain, step, template, { sessionId, timestamp });
      }
    }
    timestamp += 60_000;
    const result = ingestAddonEvent(createSimulatorSessionEvent('session_end', loadBible(), sessionId, timestamp));
    setCurrentSessionId(null);
    setCursor({ stepIndex: chain.steps.length - 1, eventIndex: chain.steps[chain.steps.length - 1]?.events.length ?? 0 });
    setLastResult(`Full simulated session complete — ${result.message}`);
  }

  function clearLog() {
    const label = activeCharacterKey ? 'this hero' : 'all heroes';
    if (!window.confirm(`Clear addon simulator event records for ${label}? Character history is not changed.`)) return;
    clearAddonEventRecords(activeCharacterKey);
    setRecords(loadAddonEventRecords());
    setLastResult('Addon event log cleared.');
  }

  if (!chain) {
    return (
      <section className="at-panel">
        <h2>Addon Simulator</h2>
        <p className="at-callout-danger">No quest fixtures are available.</p>
      </section>
    );
  }

  const factionMismatch = bible && bible.faction !== chain.faction;
  const complete = !currentTemplate;

  return (
    <section className="at-panel">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2>Addon Simulator</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Step through Classic quest chains as if a future WoW addon emitted structured API events.
          </p>
        </div>
        <label className="at-field" style={{ minWidth: 280 }}>
          <span className="at-field-label">Quest chain fixture</span>
          <select className="at-input" value={chain.id} onChange={(e) => selectChain(e.target.value)}>
            {CLASSIC_QUEST_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.faction} · {c.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      <hr className="ornament" />

      {!bible && (
        <div className="at-callout-danger" style={{ marginBottom: '1rem' }}>
          Roll or select a character first. Events can be logged without a hero, but they cannot update story memory.
        </div>
      )}

        {bible && (
          <div className={factionMismatch ? 'at-callout-danger' : 'at-callout'} style={{ marginBottom: '1rem' }}>
            <strong>Active hero:</strong> {bible.name} · {bible.faction} · {bible.race} {bible.class}
          {factionMismatch && (
            <span> — this chain is {chain.faction}, so use it as a cross-faction stress test only.</span>
          )}
          </div>
        )}

        <section className="at-panel" style={{ boxShadow: 'none', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h3>Simulated play session</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                Wrap emitted WoW events in a session so Chronicle can show start, finish, duration, quest count, levels gained, deaths, zones, and a campfire recap.
              </p>
              <p className="faint" style={{ fontSize: 12 }}>
                {currentSessionId ? `Open session: ${currentSessionId}` : 'No open session. Events still log, but explicit sessions make the stats cleaner.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button className="at-btn at-btn-primary" onClick={startSession} disabled={Boolean(currentSessionId)}>
                Start session
              </button>
              <button className="at-btn at-btn-secondary" onClick={emitDeath}>
                Emit death
              </button>
              <button className="at-btn at-btn-secondary" onClick={endSession} disabled={!currentSessionId}>
                End session
              </button>
              <button className="at-btn at-btn-secondary" onClick={emitFullChainSession}>
                Run full chain as session
              </button>
            </div>
          </div>
        </section>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <ChainOverview chain={chain} />

        {currentStep && (
          <CurrentStepPanel
            chain={chain}
            step={currentStep}
            template={currentTemplate}
            stepIndex={cursor.stepIndex}
            eventIndex={cursor.eventIndex}
            complete={complete}
            questText={questTextFor(currentStep)}
            setQuestText={(text) => setQuestText(currentStep, text)}
            onEmitNext={emitNextEvent}
            onEmitStep={emitCurrentStep}
            onReset={resetScenario}
          />
        )}

        {lastResult && (
          <div className="at-callout-success" style={{ fontSize: 14 }}>
            {lastResult}
          </div>
        )}

        <StoryTestPanel />

        <EventLogPanel records={scopedRecords} onClear={clearLog} />
      </div>
    </section>
  );
}

function ChainOverview({ chain }: { chain: QuestChainFixture }) {
  return (
    <section className="at-panel" style={{ boxShadow: 'none' }}>
      <h3>{chain.title}</h3>
      <p className="muted">{chain.summary}</p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <span className={`at-sheet-pill ${chain.faction === 'Alliance' ? 'at-faction-alliance' : 'at-faction-horde'}`}>
          {chain.faction}
        </span>
        <span className="at-sheet-pill">{chain.era}</span>
        <span className="at-sheet-pill">{chain.steps.length} quest steps</span>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <strong>Path:</strong> {chain.zonePath.join(' → ')}
      </p>
      <p className="faint" style={{ fontSize: 12 }}>
        {chain.versionNotes}
      </p>
    </section>
  );
}

function CurrentStepPanel({
  chain,
  step,
  template,
  stepIndex,
  eventIndex,
  complete,
  questText,
  setQuestText,
  onEmitNext,
  onEmitStep,
  onReset,
}: {
  chain: QuestChainFixture;
  step: QuestStepFixture;
  template: AddonEventTemplate | null;
  stepIndex: number;
  eventIndex: number;
  complete: boolean;
  questText: string;
  setQuestText: (text: string) => void;
  onEmitNext: () => void;
  onEmitStep: () => void;
  onReset: () => void;
}) {
  return (
    <section className="at-panel" style={{ boxShadow: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3>
            Step {stepIndex + 1}/{chain.steps.length}: {step.questName} #{step.questId}
          </h3>
          <p className="muted">{step.storyCard.moment}</p>
        </div>
        <a href={step.wowheadUrl} target="_blank" rel="noreferrer noopener" className="at-btn at-btn-secondary at-btn-sm">
          Wowhead
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
        <StoryCardField label="Setup" text={step.storyCard.setup} />
        <StoryCardField label="Player action" text={step.storyCard.playerAction} />
        <StoryCardField label="Outcome" text={step.storyCard.outcome} />
        <StoryCardField label="Emotional weight" text={step.storyCard.emotionalWeight} />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label className="at-field">
          <span className="at-field-label">Optional quest text / local story notes</span>
          <textarea
            className="at-input at-prose"
            rows={4}
            value={questText}
            onChange={(e) => setQuestText(e.target.value)}
            placeholder="Paste quest text from the game client or add your own notes. This stays local and is attached only to simulated events for this step."
          />
        </label>
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
        <div className="at-callout">
          {template ? (
            <>
              <strong>Next simulated WoW event:</strong>{' '}
              <code>{template.wowEvent}</code> · {template.summary}
              <div className="faint" style={{ marginTop: 4, fontSize: 12 }}>
                event {eventIndex + 1}/{step.events.length}
              </div>
            </>
          ) : (
            <span>Scenario cursor is at the end of the chain.</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="at-btn at-btn-primary" onClick={onEmitNext} disabled={complete}>
            Emit next event
          </button>
          <button className="at-btn at-btn-secondary" onClick={onEmitStep} disabled={complete}>
            Emit full quest step
          </button>
          <button className="at-btn at-btn-secondary" onClick={onReset}>
            Reset scenario cursor
          </button>
        </div>
      </div>
    </section>
  );
}

function StoryCardField({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.75rem', background: 'var(--bg-inset)' }}>
      <div className="at-field-label">{label}</div>
      <p style={{ marginBottom: 0 }}>{text}</p>
    </div>
  );
}

function StoryTestPanel() {
  return (
    <section className="at-panel" style={{ boxShadow: 'none' }}>
      <h3>Story integrity prompts</h3>
      <p className="muted">
        After stepping a chain, jump to Tavern and ask an NPC one of these. If the answer loses the stakes, the story card is too thin.
      </p>
      <ul style={{ marginTop: '0.75rem' }}>
        <li>What have you heard of my recent deeds?</li>
        <li>Was that victory clean, or did it reveal something darker?</li>
        <li>What should my hero carry forward from this?</li>
      </ul>
    </section>
  );
}

function EventLogPanel({ records, onClear }: { records: AddonEventRecord[]; onClear: () => void }) {
  return (
    <section className="at-panel" style={{ boxShadow: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Addon event log</h3>
        <button className="at-btn at-btn-secondary at-btn-sm" onClick={onClear} disabled={records.length === 0}>
          Clear log
        </button>
      </div>

      {records.length === 0 ? (
        <p className="muted">No simulated addon events yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.85rem' }}>
          {records.slice(0, 12).map((record) => (
            <article key={record.event.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.75rem', background: 'var(--bg-inset)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <code>{record.event.wowEvent}</code>
                {record.event.questId && <strong>#{record.event.questId}</strong>}
                {record.event.questName && <span>{record.event.questName}</span>}
                <span className="faint">· {record.result.status}</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>{record.event.summary}</p>
              {record.result.changes.length > 0 && (
                <p className="faint" style={{ marginBottom: 0, fontSize: 12 }}>
                  Changed: {record.result.changes.join(', ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
