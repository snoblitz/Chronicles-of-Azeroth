import { useEffect, useState } from 'react';
import { CharacterCreation } from './CharacterCreation';
import { CharacterAutoImport, type AutoImportResult } from './CharacterAutoImport';
import type { LLMProvider, CharacterBible } from '../types';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { getKeyStatus } from '../lib/apiKeys';
import { generatePrologue, PrologueError } from '../lib/prologueGenerator';
import { saveBible } from '../lib/bibleStore';

const DRAFT_KEY = 'at:autoimport-draft';

type Mode = 'manual' | 'auto';

/**
 * Wraps the Character tab so the user can choose between the original
 * manual interview path and the new SavedVariables auto-import path.
 *
 * Provider acquisition (OpenRouter by default) happens lazily on first
 * auto-import open so users without a key can still use manual.
 */
export function CharacterTab() {
  const [mode, setMode] = useState<Mode>('manual');
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<AutoImportResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedBible, setGeneratedBible] = useState<CharacterBible | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGeneratePrologue() {
    if (!savedDraft || !provider) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generatePrologue(
        {
          character: savedDraft.character,
          profile: savedDraft.profile,
          seedAnswer: savedDraft.seedAnswer,
          intel: savedDraft.intel,
        },
        provider,
      );
      setGeneratedBible(result.bible);
    } catch (e) {
      const msg = e instanceof PrologueError ? e.message : (e as Error).message;
      setGenerateError(msg);
    } finally {
      setGenerating(false);
    }
  }

  function handleAcceptBible() {
    if (!generatedBible) return;
    saveBible(generatedBible);
    setGeneratedBible(null);
    setSavedDraft(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setMode('manual'); // drop user into the standard reader UI
  }

  useEffect(() => {
    if (mode !== 'auto' || provider) return;
    let cancelled = false;
    (async () => {
      try {
        const choice = MODEL_CHOICES[DEFAULT_MODEL_INDEX];
        const p = await choice.factory();
        if (!cancelled) setProvider(p);
      } catch (e) {
        if (!cancelled) setProviderError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, provider]);

  function handleComplete(result: AutoImportResult) {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...result, savedAt: Date.now(), schemaVersion: 1 }),
      );
    } catch {
      // localStorage full or unavailable -- still surface the result to the
      // user; they can copy the answer manually.
    }
    setSavedDraft(result);
  }

  const hasKey = getKeyStatus('openrouter').hasKey;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.2rem',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          className={`at-btn ${mode === 'manual' ? 'at-btn-primary' : 'at-btn-secondary'}`}
          onClick={() => setMode('manual')}
        >
          Interview (manual)
        </button>
        <button
          type="button"
          className={`at-btn ${mode === 'auto' ? 'at-btn-primary' : 'at-btn-secondary'}`}
          onClick={() => setMode('auto')}
          title={hasKey ? '' : 'Auto-import uses the AI for Inspire Me. Add an OpenRouter key in ⚙ Keys.'}
        >
          ✦ Auto-import (from SavedVariables)
        </button>
      </div>

      {savedDraft && mode === 'auto' && (
        <div className="at-callout at-callout-success" style={{ marginBottom: '1rem' }}>
          <strong>Draft saved.</strong> {savedDraft.character.identity.name}'s onboarding payload
          is in localStorage as <code>{DRAFT_KEY}</code>. The next step (prologue generator) will
          turn this into a full chronicle bible.
        </div>
      )}

      {mode === 'manual' && <CharacterCreation />}

      {mode === 'auto' && providerError && (
        <div className="at-callout at-callout-danger">
          <strong>Could not start auto-import.</strong> {providerError}
        </div>
      )}

      {mode === 'auto' && !providerError && !provider && (
        <div className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
          Loading provider…
        </div>
      )}

      {mode === 'auto' && provider && !savedDraft && (
        <CharacterAutoImport
          provider={provider}
          onComplete={handleComplete}
          onCancel={() => setMode('manual')}
        />
      )}

      {mode === 'auto' && provider && savedDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!generatedBible && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="at-btn at-btn-primary"
                onClick={handleGeneratePrologue}
                disabled={generating}
              >
                {generating ? 'Generating prologue…' : '✦ Generate prologue & bible'}
              </button>
              <button
                type="button"
                className="at-btn at-btn-secondary"
                onClick={() => setSavedDraft(null)}
                disabled={generating}
              >
                Onboard another character
              </button>
              <button
                type="button"
                className="at-btn at-btn-secondary"
                onClick={() => setMode('manual')}
                disabled={generating}
              >
                Done
              </button>
            </div>
          )}

          {generateError && (
            <div className="at-callout at-callout-danger">
              <strong>Generation failed.</strong> {generateError}
            </div>
          )}

          {generatedBible && (
            <div className="at-panel" style={{ padding: '1.2rem' }}>
              <h3 style={{ marginTop: 0 }}>{generatedBible.name}'s prologue draft</h3>
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                Generated from your trait selections and seed answer. Accept to save as
                the active chronicle; reject to regenerate.
              </p>
              <h4>Backstory</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{generatedBible.backstory}</p>
              <h4>Voice</h4>
              <p>{generatedBible.voice}</p>
              {generatedBible.coreQuote && (
                <p>
                  <em>"{generatedBible.coreQuote}"</em>
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <h4>Beliefs</h4>
                  <ul>
                    {generatedBible.beliefs.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Motivations</h4>
                  <ul>
                    {generatedBible.motivations.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
                {generatedBible.fears && generatedBible.fears.length > 0 && (
                  <div>
                    <h4>Fears</h4>
                    <ul>
                      {generatedBible.fears.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {generatedBible.flaws && generatedBible.flaws.length > 0 && (
                  <div>
                    <h4>Flaws</h4>
                    <ul>
                      {generatedBible.flaws.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
                <button type="button" className="at-btn at-btn-primary" onClick={handleAcceptBible}>
                  ✓ Accept & save bible
                </button>
                <button
                  type="button"
                  className="at-btn at-btn-secondary"
                  onClick={() => {
                    setGeneratedBible(null);
                    handleGeneratePrologue();
                  }}
                >
                  ↻ Regenerate
                </button>
                <button
                  type="button"
                  className="at-btn at-btn-secondary"
                  onClick={() => setGeneratedBible(null)}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
