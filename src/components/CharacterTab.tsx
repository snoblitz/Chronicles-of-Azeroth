import { useEffect, useState } from 'react';
import { CharacterCreation } from './CharacterCreation';
import { CharacterAutoImport, type AutoImportResult } from './CharacterAutoImport';
import type { LLMProvider } from '../types';
import { MODEL_CHOICES, DEFAULT_MODEL_INDEX } from '../lib/modelChoices';
import { getKeyStatus } from '../lib/apiKeys';

const DRAFT_KEY = 'coa:autoimport-draft';

type Mode = 'manual' | 'auto';

/**
 * Wraps the Character tab so the user can choose between the original
 * manual interview path and the new SavedVariables auto-import path.
 *
 * Provider acquisition (Gemini Flash by default) happens lazily on first
 * auto-import open so users without a Gemini key can still use manual.
 */
export function CharacterTab() {
  const [mode, setMode] = useState<Mode>('manual');
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<AutoImportResult | null>(null);

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

  const geminiKey = getKeyStatus('gemini').hasKey;

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
          className={`coa-btn ${mode === 'manual' ? 'coa-btn-primary' : 'coa-btn-secondary'}`}
          onClick={() => setMode('manual')}
        >
          Interview (manual)
        </button>
        <button
          type="button"
          className={`coa-btn ${mode === 'auto' ? 'coa-btn-primary' : 'coa-btn-secondary'}`}
          onClick={() => setMode('auto')}
          title={geminiKey ? '' : 'Auto-import uses the AI for Inspire Me. Add a Gemini key in ⚙ Keys.'}
        >
          ✦ Auto-import (from SavedVariables)
        </button>
      </div>

      {savedDraft && mode === 'auto' && (
        <div className="coa-callout coa-callout-success" style={{ marginBottom: '1rem' }}>
          <strong>Draft saved.</strong> {savedDraft.character.identity.name}'s onboarding payload
          is in localStorage as <code>{DRAFT_KEY}</code>. The next step (prologue generator) will
          turn this into a full chronicle bible.
        </div>
      )}

      {mode === 'manual' && <CharacterCreation />}

      {mode === 'auto' && providerError && (
        <div className="coa-callout coa-callout-danger">
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="coa-btn coa-btn-secondary"
            onClick={() => setSavedDraft(null)}
          >
            Onboard another character
          </button>
          <button
            type="button"
            className="coa-btn coa-btn-primary"
            onClick={() => setMode('manual')}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
