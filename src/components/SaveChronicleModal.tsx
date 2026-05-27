import { useEffect, useState } from 'react';
import { saveChronicle, signIn } from '../lib/auth';

export type AuthModalMode = 'save' | 'signin';

interface Props {
  open: boolean;
  mode: AuthModalMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthModalMode) => void;
}

const COPY = {
  save: {
    title: 'Save your chronicle',
    blurb:
      "Your hero already lives in this browser. Tie it to an email and your chronicle survives a cleared cache — and you'll be able to read it on your phone. No password to remember.",
    cta: 'Send me the link',
    sent: (email: string) =>
      `Check ${email} for a link to save your chronicle. Click it and you're set — same hero, now safe.`,
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in instead',
  },
  signin: {
    title: 'Welcome back',
    blurb:
      "Enter the email tied to your chronicle and we'll send a one-tap sign-in link. No password needed.",
    cta: 'Send sign-in link',
    sent: (email: string) => `Check ${email} for your sign-in link.`,
    switchPrompt: 'New here?',
    switchLabel: 'Save your chronicle',
  },
} as const;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function SaveChronicleModal({ open, mode, onClose, onSwitchMode }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setBusy(false);
    setError(null);
    setSentTo(null);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = COPY[mode];

  async function submit() {
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = mode === 'save' ? await saveChronicle(value) : await signIn(value);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setSentTo(value);
  }

  return (
    <div className="at-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="at-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-auth-title"
      >
        <header className="at-modal-header">
          <h2 id="at-auth-title" style={{ margin: 0 }}>{copy.title}</h2>
          <button className="at-modal-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </header>

        {sentTo ? (
          <>
            <p style={{ marginTop: 0, fontFamily: 'var(--font-body)', fontSize: 16 }}>
              📜 {copy.sent(sentTo)}
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              The link opens on this device. Didn’t get it? Check spam, or close and try again.
            </p>
            <footer className="at-modal-footer">
              <button className="at-btn at-btn-secondary" onClick={onClose}>Done</button>
            </footer>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{copy.blurb}</p>

            <div className="at-settings-row">
              <input
                className="at-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                autoFocus
                spellCheck={false}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) submit();
                }}
              />
              <button
                type="button"
                className="at-btn at-btn-primary"
                onClick={submit}
                disabled={busy || !email.trim()}
              >
                {busy ? 'Sending…' : copy.cta}
              </button>
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0.6rem 0 0' }}>{error}</p>
            )}

            <p className="muted" style={{ margin: '0.85rem 0 0', fontSize: 13 }}>
              {copy.switchPrompt}{' '}
              <button
                type="button"
                onClick={() => onSwitchMode(mode === 'save' ? 'signin' : 'save')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: 'var(--gold-bright)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {copy.switchLabel}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
