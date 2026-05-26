// ============================================================================
// Scribe's Desk — the Free/BYOK manual workflow page.
//
// Linear stepper: (1) Import SV → (2) Filter → (3) Enrich → (4) Export snippet.
// Free-tier users live here. Paid Companion+ users get this all done for
// them by the desktop daemon (which produces the same .lua restore file).
//
// See docs/companion-architecture.md for the bigger picture.
//
// Refactored out of ChronicleReader.tsx (which is now pure-read) on
// 2026-05-26.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { AddonImport } from './AddonImport';
import { EventFilterPanel } from './EventFilterPanel';
import { ModelPicker } from './ModelPicker';
import { DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { loadBible } from '../lib/bibleStore';
import { loadAddonEventRecords, type AddonEventRecord } from '../lib/addonEventStore';
import { buildChronicleBlob, entryId } from '../lib/chronicleExport';
import { buildChronicleSnippet, SNIPPET_FILENAME } from '../lib/chronicleSnippet';
import { enrichEvent } from '../lib/eventEnrichment';
import {
  defaultEventFilter,
  loadEventFilter,
  passesFilter,
  saveEventFilter,
  unknownEventTypes,
  type EventFilter,
} from '../lib/eventFilter';
import type { AddonEvent } from '../lib/addonEvents';
import type { CharacterBible, LLMResponse } from '../types';

const ENRICH_CONCURRENCY = 3;

export function ScribesDesk() {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  const [records, setRecords] = useState<AddonEventRecord[]>(() => loadAddonEventRecords());

  useEffect(() => {
    const onBible = (e: Event) => {
      const detail = (e as CustomEvent<CharacterBible | null>).detail;
      setBible(detail ?? loadBible());
    };
    window.addEventListener('at:bible-updated', onBible);
    return () => window.removeEventListener('at:bible-updated', onBible);
  }, []);

  useEffect(() => {
    const onAddon = () => setRecords(loadAddonEventRecords());
    window.addEventListener('at:addon-events-updated', onAddon);
    window.addEventListener('storage', onAddon);
    return () => {
      window.removeEventListener('at:addon-events-updated', onAddon);
      window.removeEventListener('storage', onAddon);
    };
  }, []);

  const characterKey = bible ? String(bible.createdAt) : null;
  const scopedRecords = useMemo(
    () => (characterKey ? records.filter((r) => r.characterKey === characterKey) : []),
    [records, characterKey],
  );

  return (
    <>
      <style>{`
        .desk-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1.5rem;
          align-items: start;
        }
        .desk-main {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          min-width: 0;
        }
        .desk-sidebar {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        @media (min-width: 960px) {
          .desk-layout {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
          .desk-sidebar {
            position: sticky;
            top: 1rem;
            max-height: calc(100vh - 2rem);
            overflow-y: auto;
          }
        }
      `}</style>
      <div className="desk-layout">
        <div className="desk-main">
          <header>
            <p className="at-kicker">Scribe's Desk · Artisan workflow ✦</p>
            <h2 style={{ margin: '0 0 0.25rem' }}>Turn raw play into a chapter, your way</h2>
            <p className="muted" style={{ margin: 0 }}>
              Import your save file, pick which moments become prose, enrich them with the model
              of your choice, and download a restore file to drop back into the game. Four steps.
              Your hands on every one of them.
            </p>
          </header>

          <Step
            number={1}
            title="Import your save file"
            helper="The importer will walk you through where to find it."
          >
            <AddonImport />
            {scopedRecords.length > 0 && (
              <p className="muted" style={{ marginTop: '0.5rem', fontSize: 13 }}>
                ✓ {scopedRecords.length.toLocaleString()} addon event
                {scopedRecords.length === 1 ? '' : 's'} loaded for{' '}
                <strong>{bible?.name ?? 'your hero'}</strong>.
              </p>
            )}
          </Step>

          {!bible ? (
            <div className="at-callout" style={{ padding: '0.75rem 1rem' }}>
              Roll or select a character first — Scribe's Desk needs a bible to know whose voice
              it's writing in.
            </div>
          ) : scopedRecords.length === 0 ? (
            <div className="at-callout" style={{ padding: '0.75rem 1rem' }}>
              Nothing to filter or enrich yet. Drop an SV file above to begin.
            </div>
          ) : (
            <DeskWorkflow bible={bible} records={scopedRecords} />
          )}
        </div>

        <aside className="desk-sidebar">
          <CompanionPitchCompact />
        </aside>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Tier upsell — production-ready pitch card. Sits above the workflow steps so
// users see the magic moment + the tier comparison before they roll up their
// sleeves. Pricing is the launch straw-man; revisit before billing goes live.
//
// CTAs are wired to a `at:upgrade-clicked` window event for now — Stripe
// Checkout will replace this handler when billing lands.
// ----------------------------------------------------------------------------

interface TierDef {
  id: string;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  pitch: string;
  bullets: string[];
  closer?: string;
  cta: string;
  highlight?: boolean;
  ctaVariant?: 'primary' | 'secondary' | 'ghost';
}

export const TIERS: TierDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'The Artisan writes their own story.',
    pitch:
      "No subscription. No automation. Just you, your OpenRouter key, and a blank chronicle waiting to be filled.",
    bullets: [
      '1 hero',
      'Manual import — you control what goes in',
      'Your OpenRouter key, your model choice — Claude, Gemini, whatever you prefer',
      'Desktop reader included',
    ],
    closer: 'Free stays free. Your chronicle stays yours.',
    cta: 'Save your chronicle',
    ctaVariant: 'secondary',
  },
  {
    id: 'companion',
    name: 'Companion',
    price: '$12',
    cadence: '/ month',
    tagline: 'The Companion is with you.',
    pitch:
      "Your session ends. Your story doesn't. Automation handles everything — your run becomes a chapter, your phone gets the ping.",
    bullets: [
      '3 heroes',
      'Gameplay monitoring — no manual import, ever',
      'AI turns your session into cinematic prose',
      'Cloud sync, mobile delivery, and a push notification the moment your chapter is ready',
    ],
    cta: 'Begin the chronicle',
    highlight: true,
    ctaVariant: 'primary',
  },
  {
    id: 'chronicler',
    name: 'Chronicler',
    price: '$24',
    cadence: '/ month',
    tagline: 'The Chronicler keeps the record.',
    pitch:
      'Everything in Companion — plus your chronicle becomes a permanent artifact. A real book you can hold, send, or save for someone who matters.',
    bullets: [
      '10 heroes',
      'ePub & PDF export — put it on a Kindle, send it to your dad, save it for your daughter',
      "Chapter regeneration — didn't love a chapter? Try another take. Keep the best one.",
      'Hero bible polish — AI helps you deepen and evolve your character as the story grows',
      "Saga memory — your hero's arc carries forward across every chapter, automatically",
    ],
    cta: 'Keep the book',
    ctaVariant: 'secondary',
  },
  {
    id: 'loremaster',
    name: 'Loremaster',
    price: '$49',
    cadence: '/ month',
    tagline: 'The Loremaster owns the canon.',
    pitch:
      'Everything in Chronicler — plus your hero earns a name in the world. A URL. A voice.',
    bullets: [
      'Unlimited heroes',
      'Public hero page — chronicles.gg/youralvarius — your story as a polished web read, shareable with anyone',
      'Audio narration — every chapter as a listenable cut, with consistent per-NPC voices',
      'Priority access — first in line for everything we ship next',
    ],
    cta: 'Claim your canon',
    ctaVariant: 'secondary',
  },
];

function CompanionPitchCompact() {
  const [showAll, setShowAll] = useState(false);
  const companionTier = TIERS.find((t) => t.id === 'companion')!;

  function upgrade(tierId: string) {
    window.dispatchEvent(new CustomEvent('at:upgrade-clicked', { detail: tierId }));
  }

  return (
    <>
      <aside
        style={{
          padding: '1rem 1rem 1rem',
          border: '1px solid var(--cp-accent, #a47ad1)',
          borderRadius: '0.7rem',
          background:
            'linear-gradient(135deg, rgba(107,74,142,0.12), rgba(107,74,142,0.03))',
          color: 'var(--cp-text, #f0e6d2)',
        }}
      >
        <p className="at-kicker" style={{ margin: 0 }}>
          ✦ Beyond the logout
        </p>
        <h3
          style={{
            margin: '0.2rem 0 0.5rem',
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            lineHeight: 1.25,
          }}
        >
          Your story, everywhere, the moment it exists
        </h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, opacity: 0.92 }}>
          Log out, walk to the kitchen, and your phone buzzes:{' '}
          <em>New chapter ready.</em> The run you just played becomes prose you
          read at the sink.
        </p>
      </aside>

      <TierCard tier={companionTier} onUpgrade={() => upgrade(companionTier.id)} />

      <button
        type="button"
        className="at-btn at-btn-secondary at-btn-sm"
        onClick={() => setShowAll(true)}
        style={{ width: '100%' }}
      >
        Compare all tiers →
      </button>

      <p
        className="muted"
        style={{ margin: '0.25rem 0 0', fontSize: 11.5, textAlign: 'center', lineHeight: 1.5 }}
      >
        Cancel anytime. Your chronicle stays yours, and Free is always there when you want the artisan path.
      </p>

      {showAll && <TierComparisonModal onClose={() => setShowAll(false)} onUpgrade={upgrade} />}
    </>
  );
}

function TierComparisonModal({
  onClose,
  onUpgrade,
}: {
  onClose: () => void;
  onUpgrade: (tierId: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3rem 1rem 2rem',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-tier-compare-title"
        style={{
          width: '100%',
          maxWidth: 1100,
          background: 'var(--cp-bg, #1a0e2e)',
          color: 'var(--cp-text, #f0e6d2)',
          padding: '1.6rem 1.6rem 1.8rem',
          borderRadius: '0.9rem',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <h2 id="at-tier-compare-title" style={{ margin: 0, fontFamily: 'var(--font-display)' }}>
            Compare all tiers
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{
              background: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 1.2rem', fontSize: 14, opacity: 0.85 }}>
          Cancel anytime. Your chronicle stays yours, and Free is always there when you want the artisan path.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} onUpgrade={() => onUpgrade(tier.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}


export function TierCard({ tier, onUpgrade }: { tier: TierDef; onUpgrade: () => void }) {
  const isHighlight = !!tier.highlight;
  return (
    <article
      style={{
        position: 'relative',
        border: isHighlight
          ? '2px solid var(--cp-accent, #a47ad1)'
          : '1px solid rgba(255,255,255,0.18)',
        borderRadius: '0.6rem',
        padding: '1.1rem 1.1rem 1.1rem',
        background: isHighlight
          ? 'rgba(107,74,142,0.22)'
          : 'rgba(0,0,0,0.32)',
        color: 'var(--cp-text, #f0e6d2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: isHighlight ? '0 4px 16px rgba(107,74,142,0.25)' : 'none',
      }}
    >
      {isHighlight && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            right: 12,
            background: 'var(--cp-accent, #a47ad1)',
            color: '#1a0e2e',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 10px',
            borderRadius: 999,
          }}
        >
          Most popular · Best story
        </span>
      )}

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.65,
            fontWeight: 600,
          }}
        >
          {tier.name} · {tier.cadence === 'forever' ? 'forever' : tier.cadence.replace('/ ', '')}
        </p>
        <h4
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: 'inherit',
            lineHeight: 1.2,
          }}
        >
          {tier.tagline}
        </h4>
        <p style={{ margin: '0.15rem 0 0', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'inherit' }}>{tier.price}</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>{tier.cadence}</span>
        </p>
      </header>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, opacity: 0.95 }}>
        {tier.pitch}
      </p>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {tier.bullets.map((b, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 8,
              fontSize: 13.5,
              lineHeight: 1.5,
              opacity: 0.95,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: '0 0 auto',
                color: 'var(--cp-accent, #a47ad1)',
                fontWeight: 700,
                paddingTop: 1,
              }}
            >
              ✦
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {tier.closer && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontStyle: 'italic',
            opacity: 0.85,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            paddingTop: '0.6rem',
          }}
        >
          {tier.closer}
        </p>
      )}

      <div style={{ flex: 1 }} />
      <button
        type="button"
        className={tier.ctaVariant === 'primary' ? 'at-btn at-btn-primary' : 'at-btn at-btn-secondary'}
        onClick={onUpgrade}
        disabled={tier.ctaVariant === 'ghost'}
        style={{ marginTop: 4 }}
      >
        {tier.cta}
      </button>
    </article>
  );
}

function Step({
  number,
  title,
  helper,
  children,
}: {
  number: number;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--cp-border, rgba(0,0,0,0.12))',
        borderRadius: '0.6rem',
        padding: '1rem 1.1rem',
        background: 'var(--cp-surface-soft, rgba(0,0,0,0.02))',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--cp-accent, #6b4a8e)',
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            flex: '0 0 auto',
          }}
        >
          {number}
        </span>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
      </header>
      {helper && (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: 13 }}>
          {helper}
        </p>
      )}
      {children}
    </section>
  );
}

// ----------------------------------------------------------------------------
// The actual filter → enrich → export workflow, shown only when we have both
// a bible and imported records to act on.
// ----------------------------------------------------------------------------

function DeskWorkflow({ bible, records }: { bible: CharacterBible; records: AddonEventRecord[] }) {
  const allEvents = useMemo<AddonEvent[]>(
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
  const [enabledEvents, setEnabledEvents] = useState<EventFilter>(() => loadEventFilter());

  useEffect(() => {
    saveEventFilter(enabledEvents);
  }, [enabledEvents]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of allEvents) {
      const name = e.wowEvent ?? '';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [allEvents]);

  const unknownEvents = useMemo(
    () => unknownEventTypes(allEvents.map((e) => e.wowEvent ?? '')),
    [allEvents],
  );

  const events = useMemo(
    () => allEvents.filter((e) => passesFilter(e, enabledEvents)),
    [allEvents, enabledEvents],
  );

  const ids = useMemo(() => events.map((event) => entryId(event)), [events]);
  const enrichedCount = useMemo(
    () => ids.filter((id) => Boolean(enriched[id])).length,
    [ids, enriched],
  );

  function toggleEvent(name: string) {
    setEnabledEvents((prev) => {
      const next = new Set(prev.enabled);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...prev, enabled: next };
    });
  }

  function toggleCategory(eventNames: string[], turnOn: boolean) {
    setEnabledEvents((prev) => {
      const next = new Set(prev.enabled);
      for (const name of eventNames) {
        if (turnOn) next.add(name);
        else next.delete(name);
      }
      return { ...prev, enabled: next };
    });
  }

  function setLootMinQuality(q: number) {
    setEnabledEvents((prev) => ({ ...prev, lootMinQuality: q }));
  }

  function resetFilterToDefaults() {
    setEnabledEvents(defaultEventFilter());
  }

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

  function downloadSnippet() {
    const snippet = buildChronicleSnippet({
      characterName: bible.name,
      bible: bibleProse,
      events,
      enrichments: ids
        .map((id) => ({ id, paragraph: enriched[id] ?? '' }))
        .filter((e) => e.paragraph.trim().length > 0),
    });
    const file = new Blob([snippet], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = SNIPPET_FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Step
        number={2}
        title="Pick which events become prose"
        helper="The 8 narrative defaults match what your in-game chronicle book displays. Toggle more on if you want a denser story; toggle off to cut LLM cost."
      >
        <EventFilterPanel
          filter={enabledEvents}
          counts={eventCounts}
          unknown={unknownEvents}
          enrichableTotal={events.length}
          grandTotal={allEvents.length}
          onToggleEvent={toggleEvent}
          onToggleCategory={toggleCategory}
          onLootMinQualityChange={setLootMinQuality}
          onReset={resetFilterToDefaults}
          disabled={busy}
        />
      </Step>

      <Step
        number={3}
        title="Enrich with your model of choice"
        helper={`One LLM call per event. ${events.length} would run; ${enrichedCount} already done.`}
      >
        <div className="at-chronicle-generate-controls" style={{ flexWrap: 'wrap' }}>
          <ModelPicker
            value={modelIdx}
            onChange={setModelIdx}
            disabled={busy}
            label="Enrichment model"
          />
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
            Include bible line in export
          </label>
          <button
            className="at-btn at-btn-primary"
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
          {enrichedCount > 0 && (
            <button
              className="at-btn at-btn-secondary"
              onClick={() => setEnriched({})}
              disabled={busy}
              title="Discard generated paragraphs and start over"
            >
              ✕ Clear enrichments
            </button>
          )}
        </div>
        {lastUsage && (
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: 13 }}>
            Last run: {lastUsage.count} calls, ~${lastUsage.cost.toFixed(4)}
          </p>
        )}
        {error && (
          <div className="at-callout-danger at-chronicle-error" style={{ marginTop: '0.75rem' }}>
            <strong>Enrichment hit a snag:</strong> {error}
          </div>
        )}
      </Step>

      <Step
        number={4}
        title="Send it back to the game"
        helper={
          enrichedCount === 0
            ? 'Run enrichment above first, then download the restore file.'
            : `Drop ${SNIPPET_FILENAME} into your save data folder, launch the game — done.`
        }
      >
        <div className="at-chronicle-generate-controls" style={{ flexWrap: 'wrap' }}>
          <button
            className="at-btn at-btn-primary"
            onClick={downloadSnippet}
            disabled={busy || enrichedCount === 0}
            title="Download a restore file to drop into your save data folder."
          >
            ⬇ Download {SNIPPET_FILENAME}
          </button>
          <details style={{ marginLeft: 'auto' }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
              Legacy: copy/paste blob
            </summary>
            <div
              className="at-chronicle-generate-controls"
              style={{ flexWrap: 'wrap', marginTop: '0.5rem' }}
            >
              <button
                className="at-btn at-btn-secondary"
                onClick={copyBlob}
                disabled={busy || enrichedCount === 0}
                title="Copy the at-CHRONICLE-V1 blob to your clipboard for /coa sync"
              >
                {copyState === 'copied'
                  ? '✓ Copied'
                  : copyState === 'failed'
                    ? '✗ Clipboard blocked'
                    : '⧉ Copy chronicle blob'}
              </button>
              <button
                className="at-btn at-btn-secondary"
                onClick={downloadBlob}
                disabled={busy || enrichedCount === 0}
                title="Download the blob as a .txt file"
              >
                ⬇ Download .txt
              </button>
            </div>
          </details>
        </div>
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
      </Step>
    </>
  );
}

function guessCostUsd(response: LLMResponse): number {
  const maybe = (response as unknown as { costUsd?: number }).costUsd;
  return typeof maybe === 'number' ? maybe : 0;
}
