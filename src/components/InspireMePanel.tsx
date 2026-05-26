import { useState, useCallback } from 'react';
import { generateInspireMe, InspireMeError } from '../lib/inspireMe';
import type {
  InspireMeContext,
  InspireMeSuggestion,
} from '../lib/inspireMePrompt';
import type { LLMProvider } from '../types';

interface InspireMePanelProps {
  /** Everything the prompt needs EXCEPT clickIndex (we manage that here). */
  contextWithoutClickIndex: Omit<InspireMeContext, 'clickIndex'>;
  /** Provider to make the LLM call through. */
  provider: LLMProvider;
  /** Called when the player picks a card -- parent typically sets the textarea. */
  onUse: (text: string) => void;
  /** Override the trigger button label. */
  triggerLabel?: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; suggestions: InspireMeSuggestion[]; clickIndex: number; latencyMs: number }
  | { kind: 'error'; message: string };

/**
 * Inspire Me drop-in panel.
 *
 * Sits next to or below a textarea on an onboarding open-text question.
 * Initial state is a single trigger button (so we don't burn tokens
 * until the player asks). Once clicked, it fetches 3 suggestion cards.
 * Each card is clickable -> hands `onUse(text)` back to the parent.
 * "Try 3 more" re-rolls with an incremented clickIndex to rotate hints.
 */
export function InspireMePanel({
  contextWithoutClickIndex,
  provider,
  onUse,
  triggerLabel = '✨ Inspire Me',
}: InspireMePanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const fetchSuggestions = useCallback(
    async (clickIndex: number) => {
      setPhase({ kind: 'loading' });
      try {
        const result = await generateInspireMe(
          { ...contextWithoutClickIndex, clickIndex },
          provider,
        );
        setPhase({
          kind: 'ready',
          suggestions: result.suggestions,
          clickIndex,
          latencyMs: result.latencyMs,
        });
      } catch (e) {
        const msg =
          e instanceof InspireMeError ? e.message : (e as Error).message ?? 'unknown error';
        setPhase({ kind: 'error', message: msg });
      }
    },
    [contextWithoutClickIndex, provider],
  );

  if (phase.kind === 'idle') {
    return (
      <div className="at-inspire-panel">
        <button
          type="button"
          className="at-btn at-btn-assist at-inspire-trigger"
          onClick={() => fetchSuggestions(0)}
        >
          <span className="sparkle">✦</span> {triggerLabel}
        </button>
        <div className="at-inspire-meta">
          Three starting points based on the traits you picked. Use one, edit it, or ignore.
        </div>
      </div>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <div className="at-inspire-panel">
        <button type="button" className="at-btn at-btn-assist at-inspire-trigger" disabled>
          <span className="sparkle">✦</span> Conjuring three starting points…
        </button>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="at-inspire-panel">
        <div className="at-callout at-callout-danger">
          <strong>Inspire Me failed.</strong> {phase.message}
        </div>
        <button
          type="button"
          className="at-btn at-btn-secondary at-inspire-trigger"
          onClick={() => fetchSuggestions(0)}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="at-inspire-panel">
      <div className="at-inspire-cards">
        {phase.suggestions.map((s, i) => (
          <button
            key={`${phase.clickIndex}-${i}`}
            type="button"
            className="at-inspire-card"
            onClick={() => onUse(s.text)}
            title="Use this suggestion (fills the answer field)"
          >
            <span className="at-inspire-card-title">{s.title}</span>
            <span className="at-inspire-card-text">{s.text}</span>
          </button>
        ))}
      </div>
      <div className="at-inspire-meta">
        <button
          type="button"
          className="at-btn at-btn-sm at-btn-secondary"
          onClick={() => fetchSuggestions(phase.clickIndex + 1)}
        >
          ✦ Try 3 more
        </button>
        <span>Generated in {(phase.latencyMs / 1000).toFixed(1)}s · click any card to use it.</span>
      </div>
    </div>
  );
}
