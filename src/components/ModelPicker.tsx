// ============================================================================
// ModelPicker — pure UI dropdown. Reads from `src/lib/modelChoices.ts` so all
// screens share the same model list. Each option shows a relative cost tier
// (`$` … `$$$$$`) so users don't unknowingly pick Opus and torch their
// OpenRouter credit. The currently-selected model's plain-English cost hint
// renders under the dropdown.
// ============================================================================

import { useEffect, useState } from 'react';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { getKeyStatus } from '../lib/apiKeys';

interface Props {
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  label?: string;
}

export function ModelPicker({ value, onChange, disabled, label }: Props) {
  const choice = MODEL_CHOICES[value] ?? MODEL_CHOICES[DEFAULT_MODEL_INDEX];

  // Re-render when the user saves/clears their key elsewhere (Settings panel).
  const [, bump] = useState(0);
  useEffect(() => {
    const handler = () => bump((n) => n + 1);
    window.addEventListener('at:apikey-updated', handler);
    return () => window.removeEventListener('at:apikey-updated', handler);
  }, []);
  const hasKey = getKeyStatus('openrouter').hasKey;

  return (
    <label className="at-field" style={{ minWidth: 220 }}>
      {label && <span className="at-field-label">{label}</span>}
      <select
        className="at-input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        {MODEL_CHOICES.map((c, i) => (
          <option key={c.pricingKey} value={i} title={c.costHint}>
            {c.label} — {c.costTier}
            {i === DEFAULT_MODEL_INDEX ? ' · Recommended' : ''}
          </option>
        ))}
      </select>
      {hasKey ? (
        <span
          className="muted"
          style={{ marginTop: 4, fontSize: 12, lineHeight: 1.35 }}
        >
          {choice.costHint}
        </span>
      ) : (
        <span
          className="muted"
          style={{ marginTop: 4, fontSize: 12, lineHeight: 1.35 }}
        >
          No OpenRouter key yet — open <strong>Settings ⚙</strong> (top-right) to add one.
          A typical chapter on the recommended model costs a few pennies.
        </span>
      )}
    </label>
  );
}
