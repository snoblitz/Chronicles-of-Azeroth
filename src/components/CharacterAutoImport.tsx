import { useState, useCallback, useMemo } from 'react';
import { parseSavedVariables, LuaParseError } from '../lib/luaSavedVariables';
import {
  ingestCharactersFromParsed,
  describeCharacter,
  characterLocation,
  type IngestedCharacter,
  type Classification,
} from '../lib/characterIngest';
import { TraitSelectionWizard } from './TraitSelectionWizard';
import { InspireMePanel } from './InspireMePanel';
import type { PersonalityProfile } from '../lib/personalityTraits';
import type { LLMProvider } from '../types';
import type { InspireMeContext } from '../lib/inspireMePrompt';

interface CharacterAutoImportProps {
  provider: LLMProvider;
  /** Called when the user finishes onboarding -- parent persists. */
  onComplete: (payload: AutoImportResult) => void;
  /** Called if user backs out of the wizard. */
  onCancel?: () => void;
}

export interface AutoImportResult {
  character: IngestedCharacter;
  profile: PersonalityProfile;
  /** The single seeded answer captured during the wizard. */
  seedAnswer: {
    question: string;
    text: string;
  };
}

type Step =
  | { kind: 'ingest' }
  | { kind: 'pick'; characters: IngestedCharacter[]; warnings: string[] }
  | { kind: 'traits'; character: IngestedCharacter }
  | { kind: 'seed'; character: IngestedCharacter; profile: PersonalityProfile };

const CLASSIFICATION_BADGES: Record<Classification, { label: string; tone: string; blurb: string }> = {
  'brand-new': {
    label: 'Brand new',
    tone: 'success',
    blurb: 'A fresh face -- their story is still a blank page.',
  },
  boosted: {
    label: 'Boosted',
    tone: 'magic',
    blurb: 'Arrived ready-made. Power without memory.',
  },
  'pre-existing': {
    label: 'Pre-existing',
    tone: 'gold',
    blurb: 'We are joining their story already in motion.',
  },
  pending: {
    label: 'Pending',
    tone: 'warn',
    blurb: 'Classification not yet finalized (TIME_PLAYED_MSG pending).',
  },
};

const SEED_QUESTION_BY_CLASSIFICATION: Record<Classification, string> = {
  'brand-new':
    'What is the first thing your character remembers, and how do they feel about it?',
  boosted:
    'Your character has skill and power they do not remember earning. What is the first thing that gives them pause about that?',
  'pre-existing':
    'What brought your character out of their homeland and into the wider world?',
  pending:
    'What is something your character has done that they would not undo, even given the chance?',
};

/**
 * Auto-import wizard. Three-or-four-step flow:
 *   1. Ingest -- file drop / paste of ChroniclesOfAzeroth.lua
 *   2. Pick a character from the parsed list
 *   3. Pick personality traits (5 buckets)
 *   4. Answer one seeded question (with Inspire Me available)
 *
 * Designed to live alongside the existing CharacterCreation manual path.
 */
export function CharacterAutoImport({
  provider,
  onComplete,
  onCancel,
}: CharacterAutoImportProps) {
  const [step, setStep] = useState<Step>({ kind: 'ingest' });
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState('');

  const handleSource = useCallback((src: string) => {
    setParseError(null);
    try {
      const parsed = parseSavedVariables(src);
      const ingest = ingestCharactersFromParsed(parsed);
      if (ingest.characters.length === 0) {
        setParseError(
          ingest.warnings.join(' ') ||
            'No characters found. Have you logged in on a toon with Chronicles v0.2.0+ installed?',
        );
        return;
      }
      setStep({ kind: 'pick', characters: ingest.characters, warnings: ingest.warnings });
    } catch (e) {
      const msg = e instanceof LuaParseError ? e.message : (e as Error).message;
      setParseError(`Could not parse the file: ${msg}`);
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      handleSource(text);
    },
    [handleSource],
  );

  if (step.kind === 'ingest') {
    return (
      <div className="coa-panel coa-trait-wizard">
        <div className="coa-trait-wizard-header">
          <h2>Auto-import a character</h2>
          <p className="muted">
            Drop your <code>ChroniclesOfAzeroth.lua</code> SavedVariables file. We will read who
            you have played and let you onboard them in seconds.
          </p>
          <p className="faint" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            C:\Program Files (x86)\World of Warcraft\_retail_\WTF\Account\&lt;ACCOUNT&gt;
            \SavedVariables\ChroniclesOfAzeroth.lua
          </p>
        </div>

        <FileDrop onFile={onFile} />

        <details>
          <summary className="muted">…or paste the file contents</summary>
          <textarea
            className="coa-input"
            rows={6}
            placeholder="ChroniclesOfAzerothDB = { ... }"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            style={{ width: '100%', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}
          />
          <button
            type="button"
            className="coa-btn coa-btn-secondary"
            onClick={() => handleSource(pasteValue)}
            disabled={pasteValue.trim().length === 0}
            style={{ marginTop: '0.5rem' }}
          >
            Parse pasted text
          </button>
        </details>

        {parseError && (
          <div className="coa-callout coa-callout-danger">
            <strong>Couldn't ingest.</strong> {parseError}
          </div>
        )}

        <div className="coa-trait-wizard-footer">
          <span className="muted">Step 1 of 4 -- find your character.</span>
          {onCancel && (
            <button type="button" className="coa-btn coa-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step.kind === 'pick') {
    return (
      <div className="coa-panel coa-trait-wizard">
        <div className="coa-trait-wizard-header">
          <h2>Pick a character to onboard</h2>
          <p className="muted">
            {step.characters.length} character{step.characters.length === 1 ? '' : 's'} found.
            Most recently seen first.
          </p>
        </div>

        {step.warnings.length > 0 && (
          <div className="coa-callout">
            <strong>Notes:</strong>
            <ul style={{ margin: '0.3rem 0 0 1rem' }}>
              {step.warnings.map((w, i) => (
                <li key={i} className="muted">{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="coa-trait-chip-row" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {step.characters.map((c) => {
            const badge = CLASSIFICATION_BADGES[c.classification];
            const loc = characterLocation(c);
            return (
              <button
                key={c.guid}
                type="button"
                className="coa-trait-chip"
                onClick={() => setStep({ kind: 'traits', character: c })}
                style={{ minHeight: '110px' }}
              >
                <span className="coa-trait-chip-label">{describeCharacter(c)}</span>
                <span className="coa-trait-chip-desc">
                  <span style={{ color: `var(--${badge.tone})`, fontWeight: 600 }}>
                    {badge.label}
                  </span>
                  {' · '}
                  {badge.blurb}
                </span>
                {loc && (
                  <span className="coa-trait-chip-desc" style={{ fontSize: '0.82rem' }}>
                    Last seen in {loc}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="coa-trait-wizard-footer">
          <span className="muted">Step 2 of 4 -- choose.</span>
          <button
            type="button"
            className="coa-btn coa-btn-secondary"
            onClick={() => setStep({ kind: 'ingest' })}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'traits') {
    return (
      <TraitSelectionWizard
        heading={`Personality for ${step.character.identity.name}`}
        subtitle="Five quick choices. They guide the AI when it writes your story, but never override what you write yourself."
        onComplete={(profile) => setStep({ kind: 'seed', character: step.character, profile })}
        onCancel={() => setStep({ kind: 'pick', characters: [step.character], warnings: [] })}
      />
    );
  }

  // step.kind === 'seed'
  return (
    <SeedAnswerStep
      character={step.character}
      profile={step.profile}
      provider={provider}
      onBack={() => setStep({ kind: 'traits', character: step.character })}
      onCancel={onCancel}
      onComplete={onComplete}
    />
  );
}

// ---------------------------------------------------------------------------

interface FileDropProps {
  onFile: (file: File) => void;
}

function FileDrop({ onFile }: FileDropProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`coa-trait-bucket${dragging ? ' coa-trait-chip-selected' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '2rem',
        cursor: 'pointer',
        border: `2px dashed ${dragging ? 'var(--gold)' : 'var(--border-strong)'}`,
        textAlign: 'center',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <span style={{ fontSize: '1.6rem' }}>📜</span>
      <strong style={{ color: 'var(--gold-bright)' }}>Drop ChroniclesOfAzeroth.lua here</strong>
      <span className="muted" style={{ fontSize: '0.9rem' }}>or click to pick a file</span>
      <input
        type="file"
        accept=".lua,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------

interface SeedAnswerStepProps {
  character: IngestedCharacter;
  profile: PersonalityProfile;
  provider: LLMProvider;
  onBack: () => void;
  onCancel?: () => void;
  onComplete: (payload: AutoImportResult) => void;
}

function SeedAnswerStep({
  character,
  profile,
  provider,
  onBack,
  onCancel,
  onComplete,
}: SeedAnswerStepProps) {
  const question = SEED_QUESTION_BY_CLASSIFICATION[character.classification];
  const [draft, setDraft] = useState('');

  const inspireContext = useMemo<Omit<InspireMeContext, 'clickIndex'>>(() => {
    const lvl = character.lastSeen?.level ?? character.firstSeen.level;
    const zone = character.lastSeen?.zoneText ?? character.firstSeen.zoneText;
    const subzone = character.lastSeen?.subzoneText ?? character.firstSeen.subzoneText;
    return {
      character: {
        name: character.identity.name,
        race: character.identity.race,
        class: character.identity.class,
        sex: character.identity.sex,
        faction: character.identity.faction,
        classification: character.classification,
        level: lvl,
        zone,
        subzone,
      },
      profile,
      intel: [], // future: feed third-party SV scanner results in here
      currentQuestion: question,
      draft: draft.trim() || undefined,
    };
  }, [character, profile, question, draft]);

  const canFinish = draft.trim().length >= 10;

  return (
    <div className="coa-panel coa-trait-wizard">
      <div className="coa-trait-wizard-header">
        <h2>One question to seed the story</h2>
        <p className="muted">
          We'll use this and the personality you picked to start the chronicle. You can always
          edit later.
        </p>
      </div>

      <div className="coa-trait-bucket">
        <header className="coa-trait-bucket-header">
          <h3 className="coa-trait-bucket-label">Question</h3>
          <p className="muted coa-trait-bucket-desc">{question}</p>
        </header>
        <textarea
          className="coa-input"
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a few sentences, or click Inspire Me below for three starting points."
          style={{ width: '100%', fontFamily: 'var(--font-body)' }}
        />
        <InspireMePanel
          contextWithoutClickIndex={inspireContext}
          provider={provider}
          onUse={(text) => setDraft(text)}
        />
      </div>

      <div className="coa-trait-wizard-footer">
        <span className="muted">Step 4 of 4 -- {canFinish ? 'ready when you are' : 'a few sentences will do'}.</span>
        <div className="coa-trait-wizard-actions">
          {onCancel && (
            <button type="button" className="coa-btn coa-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="coa-btn coa-btn-secondary" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="coa-btn coa-btn-primary"
            disabled={!canFinish}
            onClick={() =>
              onComplete({
                character,
                profile,
                seedAnswer: { question, text: draft.trim() },
              })
            }
          >
            Save character
          </button>
        </div>
      </div>
    </div>
  );
}
