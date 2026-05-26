import { useEffect, useState } from 'react';
import {
  clearApiKey,
  getKeyStatus,
  setApiKey,
  type KeyStatus,
  type Provider,
} from '../lib/apiKeys';
import { getShowScribesDesk, setShowScribesDesk } from '../lib/featureFlags';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [status, setStatus] = useState<KeyStatus>(() => getKeyStatus('openrouter'));
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [showDesk, setShowDesk] = useState<boolean>(() => getShowScribesDesk());

  useEffect(() => {
    if (!open) return;
    setStatus(getKeyStatus('openrouter'));
    setDraft('');
    setReveal(false);
    setShowDesk(getShowScribesDesk());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function save() {
    const value = draft.trim();
    if (!value) return;
    setApiKey('openrouter', value);
    setStatus(getKeyStatus('openrouter'));
    setDraft('');
  }

  function clear() {
    if (!window.confirm('Remove the saved OpenRouter key from this browser?')) return;
    clearApiKey('openrouter');
    setStatus(getKeyStatus('openrouter'));
  }

  const provider: Provider = 'openrouter';

  return (
    <div className="at-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="at-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-settings-title"
      >
        <header className="at-modal-header">
          <h2 id="at-settings-title" style={{ margin: 0 }}>API key</h2>
          <button
            className="at-modal-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Your key is stored only in <strong>this browser's localStorage</strong> — never sent
          to any server but OpenRouter itself. It overrides anything baked into the build
          at deploy time.
        </p>

        <section className="at-settings-section">
          <div className="at-settings-section-head">
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>OpenRouter</h3>
            <StatusBadge status={status} />
          </div>

          {status.hasKey && (
            <p className="muted" style={{ margin: '0.25rem 0 0.75rem', fontSize: 13 }}>
              Active key: <code>{status.masked}</code> (from{' '}
              {status.source === 'localStorage' ? 'this browser' : 'build-time env'})
            </p>
          )}

          <div className="at-settings-row">
            <input
              className="at-input"
              type={reveal ? 'text' : 'password'}
              placeholder={status.hasKey ? 'Paste a new key to replace…' : 'Paste your OpenRouter key…'}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <button
              type="button"
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={() => setReveal((r) => !r)}
              title={reveal ? 'Hide key' : 'Show key'}
            >
              {reveal ? '🙈' : '👁'}
            </button>
            <button
              type="button"
              className="at-btn at-btn-primary at-btn-sm"
              onClick={save}
              disabled={!draft.trim()}
            >
              Save
            </button>
            {status.source === 'localStorage' && (
              <button
                type="button"
                className="at-btn at-btn-secondary at-btn-sm"
                onClick={clear}
                title="Forget the saved key"
              >
                Forget
              </button>
            )}
          </div>

          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: 12 }}>
            One key, every model (Claude, GPT, Gemini, …).{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer noopener"
            >
              openrouter.ai/keys
            </a>
            .
          </p>
        </section>

        <section className="at-settings-section" style={{ marginTop: '1rem' }}>
          <div className="at-settings-section-head">
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Advanced</h3>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem',
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={showDesk}
              onChange={(e) => {
                setShowDesk(e.target.checked);
                setShowScribesDesk(e.target.checked);
              }}
            />
            <span>
              Show <strong>Scribe's Desk</strong> tab
              <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                (manual SV import → enrich → export workflow)
              </span>
            </span>
          </label>
        </section>

        <footer className="at-modal-footer">
          <button className="at-btn at-btn-secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );

  // (provider variable retained so future multi-key UIs can re-introduce a loop)
  void provider;
}

function StatusBadge({ status }: { status: KeyStatus }) {
  if (!status.hasKey) {
    return <span className="at-key-badge at-key-badge-missing">No key</span>;
  }
  if (status.source === 'localStorage') {
    return <span className="at-key-badge at-key-badge-local">Saved here</span>;
  }
  return <span className="at-key-badge at-key-badge-env">From build env</span>;
}
