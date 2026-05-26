// ============================================================================
// ModelPicker — pure UI dropdown. Reads from `src/lib/modelChoices.ts` so all
// screens share the same model list.
// ============================================================================

import { MODEL_CHOICES } from '../lib/modelChoices';

interface Props {
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  label?: string;
}

export function ModelPicker({ value, onChange, disabled, label }: Props) {
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
          <option key={c.pricingKey} value={i}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
