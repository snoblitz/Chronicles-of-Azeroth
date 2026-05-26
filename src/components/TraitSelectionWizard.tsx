import { useState, useMemo } from 'react';
import {
  PERSONALITY_BUCKETS,
  type PersonalityProfile,
  type TraitBucketId,
  type TraitOption,
} from '../lib/personalityTraits';

interface TraitSelectionWizardProps {
  /** Existing profile to pre-populate (e.g. on edit). */
  initial?: Partial<PersonalityProfile>;
  /** Fired when all 5 buckets are selected and the player clicks Continue. */
  onComplete: (profile: PersonalityProfile) => void;
  /** Fired if the player backs out. Optional -- can be omitted from wizard. */
  onCancel?: () => void;
  /** Override the heading. Default: "Pick your character's personality". */
  heading?: string;
  /** Show a subtitle reminder. Optional. */
  subtitle?: string;
}

type Selections = Partial<Record<TraitBucketId, string>>;

/**
 * Five-bucket chip picker. One selection per bucket, all required.
 *
 * Visual model: each bucket is a section with its label, description,
 * and a row of chips. Selecting a chip in one bucket doesn't constrain
 * the others. A sticky footer tracks progress and surfaces Continue
 * once all five are picked.
 */
export function TraitSelectionWizard({
  initial,
  onComplete,
  onCancel,
  heading = "Pick your character's personality",
  subtitle = 'Five quick choices. They guide the AI when it writes your story, but never override what you write yourself.',
}: TraitSelectionWizardProps) {
  const [selections, setSelections] = useState<Selections>(() => ({
    disposition: initial?.disposition,
    moralCompass: initial?.moralCompass,
    socialStyle: initial?.socialStyle,
    drive: initial?.drive,
    flaw: initial?.flaw,
  }));

  const completed = useMemo(
    () => PERSONALITY_BUCKETS.every((b) => selections[b.id]),
    [selections],
  );

  function pick(bucketId: TraitBucketId, optionId: string) {
    setSelections((s) => ({ ...s, [bucketId]: optionId }));
  }

  function submit() {
    if (!completed) return;
    const now = Math.floor(Date.now() / 1000);
    const profile: PersonalityProfile = {
      disposition: selections.disposition!,
      moralCompass: selections.moralCompass!,
      socialStyle: selections.socialStyle!,
      drive: selections.drive!,
      flaw: selections.flaw!,
      chosenAt: initial?.chosenAt ?? now,
      source: initial?.source ?? 'wizard',
    };
    onComplete(profile);
  }

  const progress = PERSONALITY_BUCKETS.filter((b) => selections[b.id]).length;

  return (
    <div className="at-panel at-trait-wizard">
      <div className="at-trait-wizard-header">
        <h2>{heading}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>

      <div className="at-trait-buckets">
        {PERSONALITY_BUCKETS.map((bucket) => (
          <section key={bucket.id} className="at-trait-bucket">
            <header className="at-trait-bucket-header">
              <h3 className="at-trait-bucket-label">{bucket.label}</h3>
              <p className="muted at-trait-bucket-desc">{bucket.description}</p>
            </header>
            <div className="at-trait-chip-row" role="radiogroup" aria-label={bucket.label}>
              {bucket.options.map((opt) => (
                <TraitChip
                  key={opt.id}
                  option={opt}
                  selected={selections[bucket.id] === opt.id}
                  onSelect={() => pick(bucket.id, opt.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="at-trait-wizard-footer">
        <span className="at-trait-progress" aria-live="polite">
          {progress} of {PERSONALITY_BUCKETS.length} chosen
        </span>
        <div className="at-trait-wizard-actions">
          {onCancel && (
            <button type="button" className="at-btn at-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="at-btn at-btn-primary"
            onClick={submit}
            disabled={!completed}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

interface TraitChipProps {
  option: TraitOption;
  selected: boolean;
  onSelect: () => void;
}

function TraitChip({ option, selected, onSelect }: TraitChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`at-trait-chip${selected ? ' at-trait-chip-selected' : ''}`}
      onClick={onSelect}
      title={option.description}
    >
      <span className="at-trait-chip-label">{option.label}</span>
      <span className="at-trait-chip-desc">{option.description}</span>
    </button>
  );
}
