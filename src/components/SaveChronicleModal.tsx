import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveChronicle, signIn, verifyCode } from '../lib/auth';

export type AuthModalMode = 'save' | 'signin';

interface Props {
  open: boolean;
  mode: AuthModalMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthModalMode) => void;
}

const RESEND_COOLDOWN_S = 30;

const COPY = {
  save: {
    title: 'Save your chronicle',
    blurb:
      "Your hero lives in this browser — and only this browser. Tie them to an email and your chronicle survives a cleared cache, a new phone, even a different machine. No password to remember.",
    cta: 'Send me a code',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in instead',
  },
  signin: {
    title: 'Welcome back',
    blurb:
      "Enter the email tied to your chronicle and we'll send a 6-digit code. No password needed.",
    cta: 'Send me a code',
    switchPrompt: 'New here?',
    switchLabel: 'Save your chronicle',
  },
} as const;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function SaveChronicleModal({ open, mode, onClose, onSwitchMode }: Props) {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetAll() {
    setStep('request');
    setEmail('');
    setCode('');
    setBusy(false);
    setError(null);
    setConflict(false);
    setCooldown(0);
    if (cooldownTimer.current) {
      clearInterval(cooldownTimer.current);
      cooldownTimer.current = null;
    }
  }

  useEffect(() => {
    if (!open) return;
    resetAll();
  }, [open, mode]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

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

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && cooldownTimer.current) {
          clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
        }
        return Math.max(0, s - 1);
      });
    }, 1000);
  }

  async function requestCode(isResend = false) {
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    setConflict(false);
    const { error, conflict: isConflict } = mode === 'save'
      ? await saveChronicle(value)
      : await signIn(value);
    setBusy(false);
    if (error) {
      setError(error);
      setConflict(Boolean(isConflict));
      return;
    }
    setCode('');
    setStep('verify');
    if (isResend) startCooldown();
  }

  async function submitCode() {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await verifyCode(email.trim(), c, mode);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    // Auth state flips via onAuthStateChange → useAuth → cloud sync hydrates.
    onClose();
  }

  return createPortal(
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

        {step === 'verify' ? (
          <>
            <p style={{ marginTop: 0, fontFamily: 'var(--font-body)', fontSize: 16 }}>
              📜 Enter the 6-digit code we sent to <strong style={{ color: 'var(--fg)' }}>{email.trim()}</strong>.
            </p>

            <div className="at-settings-row">
              <input
                className="at-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                autoFocus
                maxLength={6}
                spellCheck={false}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) submitCode();
                }}
              />
              <button
                type="button"
                className="at-btn at-btn-primary"
                onClick={submitCode}
                disabled={busy || code.trim().length !== 6}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0.6rem 0 0' }}>{error}</p>
            )}

            <p className="muted" style={{ margin: '0.85rem 0 0', fontSize: 13, lineHeight: 1.5 }}>
              Codes expire shortly and can only be used once. Didn’t get it? Check spam, then{' '}
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => requestCode(true)}
                style={{
                  background: 'none', border: 'none', padding: 0, font: 'inherit',
                  color: cooldown > 0 ? 'var(--fg-muted)' : 'var(--gold-bright)',
                  textDecoration: 'underline', cursor: cooldown > 0 ? 'default' : 'pointer',
                }}
              >
                {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => { resetAll(); }}
                style={{
                  background: 'none', border: 'none', padding: 0, font: 'inherit',
                  color: 'var(--gold-bright)', textDecoration: 'underline', cursor: 'pointer',
                }}
              >
                use a different email
              </button>
            </p>
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
                  if (e.key === 'Enter' && !busy) requestCode();
                }}
              />
              <button
                type="button"
                className="at-btn at-btn-primary"
                onClick={() => requestCode()}
                disabled={busy || !email.trim()}
              >
                {busy ? 'Sending…' : copy.cta}
              </button>
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0.6rem 0 0' }}>
                {error}
                {conflict && mode === 'save' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => onSwitchMode('signin')}
                      style={{
                        background: 'none', border: 'none', padding: 0, font: 'inherit',
                        color: 'var(--gold-bright)', textDecoration: 'underline', cursor: 'pointer',
                      }}
                    >
                      Sign in instead?
                    </button>
                  </>
                )}
              </p>
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
    </div>,
    document.body,
  );
}
