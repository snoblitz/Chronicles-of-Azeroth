import { useEffect, useState } from 'react';
import {
  clearApiKey,
  getKeyStatus,
  setApiKey,
  type KeyStatus,
  type Provider,
} from '../lib/apiKeys';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [statuses, setStatuses] = useState<Record<Provider, KeyStatus>>(() => ({
    gemini: getKeyStatus('gemini'),
    anthropic: getKeyStatus('anthropic'),
  }));
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ gemini: '', anthropic: '' });
  const [reveal, setReveal] = useState<Record<Provider, boolean>>({ gemini: false, anthropic: false });

  useEffect(() => {
    if (!open) return;
    setStatuses({ gemini: getKeyStatus('gemini'), anthropic: getKeyStatus('anthropic') });
    setDrafts({ gemini: '', anthropic: '' });
    setReveal({ gemini: false, anthropic: false });
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

  function save(provider: Provider) {
    const value = drafts[provider].trim();
    if (!value) return;
    setApiKey(provider, value);
    setStatuses((s) => ({ ...s, [provider]: getKeyStatus(provider) }));
    setDrafts((d) => ({ ...d, [provider]: '' }));
  }

  function clear(provider: Provider) {
    if (!window.confirm(`Remove the saved ${labelFor(provider)} key from this browser?`)) return;
    clearApiKey(provider);
    setStatuses((s) => ({ ...s, [provider]: getKeyStatus(provider) }));
  }

  return (
    <div className="coa-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="coa-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-settings-title"
      >
        <header className="coa-modal-header">
          <h2 id="coa-settings-title" style={{ margin: 0 }}>API keys</h2>
          <button
            className="coa-modal-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
          >
            ✕
          </button>
        </header>

        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Keys are stored only in <strong>this browser's localStorage</strong> — never sent to any
          server but the model provider you're calling. They override anything baked into the build
          at deploy time.
        </p>

        {(['gemini', 'anthropic'] as Provider[]).map((provider) => {
          const status = statuses[provider];
          return (
            <section key={provider} className="coa-settings-section">
              <div className="coa-settings-section-head">
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>
                  {labelFor(provider)}
                </h3>
                <StatusBadge status={status} />
              </div>

              {status.hasKey && (
                <p className="muted" style={{ margin: '0.25rem 0 0.75rem', fontSize: 13 }}>
                  Active key: <code>{status.masked}</code> (from{' '}
                  {status.source === 'localStorage' ? 'this browser' : 'build-time env'})
                </p>
              )}

              <div className="coa-settings-row">
                <input
                  className="coa-input"
                  type={reveal[provider] ? 'text' : 'password'}
                  placeholder={
                    status.hasKey
                      ? 'Paste a new key to replace…'
                      : `Paste your ${labelFor(provider)} key…`
                  }
                  value={drafts[provider]}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setDrafts((d) => ({ ...d, [provider]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save(provider);
                  }}
                />
                <button
                  type="button"
                  className="coa-btn coa-btn-secondary coa-btn-sm"
                  onClick={() => setReveal((r) => ({ ...r, [provider]: !r[provider] }))}
                  title={reveal[provider] ? 'Hide key' : 'Show key'}
                >
                  {reveal[provider] ? '🙈' : '👁'}
                </button>
                <button
                  type="button"
                  className="coa-btn coa-btn-primary coa-btn-sm"
                  onClick={() => save(provider)}
                  disabled={!drafts[provider].trim()}
                >
                  Save
                </button>
                {status.source === 'localStorage' && (
                  <button
                    type="button"
                    className="coa-btn coa-btn-secondary coa-btn-sm"
                    onClick={() => clear(provider)}
                    title="Forget the saved key"
                  >
                    Forget
                  </button>
                )}
              </div>

              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: 12 }}>
                {provider === 'gemini' ? (
                  <>
                    Free tier available at{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      aistudio.google.com/apikey
                    </a>
                    .
                  </>
                ) : (
                  <>
                    Paid only —{' '}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      console.anthropic.com/settings/keys
                    </a>
                    .
                  </>
                )}
              </p>
            </section>
          );
        })}

        <footer className="coa-modal-footer">
          <button className="coa-btn coa-btn-secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function labelFor(provider: Provider): string {
  return provider === 'gemini' ? 'Gemini' : 'Anthropic';
}

function StatusBadge({ status }: { status: KeyStatus }) {
  if (!status.hasKey) {
    return <span className="coa-key-badge coa-key-badge-missing">No key</span>;
  }
  if (status.source === 'localStorage') {
    return <span className="coa-key-badge coa-key-badge-local">Saved here</span>;
  }
  return <span className="coa-key-badge coa-key-badge-env">From build env</span>;
}
