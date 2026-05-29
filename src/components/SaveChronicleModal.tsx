import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveChronicle, signIn, verifyCode, OTP_LENGTH } from '../lib/auth';
import { OtpInput } from './OtpInput';

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
      "Enter the email tied to your chronicle and we'll send a one-time code. No password needed.",
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

  async function submitCode(overrideCode?: string) {
    if (busy) return;
    const c = (overrideCode ?? code).trim();
    if (c.length !== OTP_LENGTH || /\D/.test(c)) {
      setError(`Enter the ${OTP_LENGTH}-character code from your email.`);
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
        className="at-modal at-auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-auth-title"
      >
        <button className="at-modal-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
          ✕
        </button>

        <p className="at-auth-kicker">✦ Aftertale</p>
        <h2 id="at-auth-title" className="at-auth-title">
          {step === 'verify' ? 'Check your email' : copy.title}
        </h2>
        <div className="at-auth-ornament" aria-hidden="true">✦ ✦ ✦</div>

        {step === 'verify' ? (
          <>
            <p className="at-auth-blurb">
              Enter the {OTP_LENGTH}-character code we sent to <strong>{email.trim()}</strong>.
            </p>

            <div className="at-auth-body">
              <OtpInput
                length={OTP_LENGTH}
                value={code}
                disabled={busy}
                autoFocus
                onChange={(next) => { setCode(next); if (error) setError(null); }}
                onComplete={(full) => { void submitCode(full); }}
              />

              <button
                type="button"
                className="at-btn at-btn-primary at-auth-btn"
                onClick={() => submitCode()}
                disabled={busy || code.trim().length !== OTP_LENGTH}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
            </div>

            {error && (
              <div className="at-auth-notice" role="alert">
                <span className="at-auth-notice-glyph" aria-hidden="true">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <p className="at-auth-meta">
              Codes expire shortly and can only be used once. Didn’t get it? Check spam, then{' '}
              <button
                type="button"
                className="at-auth-link"
                disabled={busy || cooldown > 0}
                onClick={() => requestCode(true)}
              >
                {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
              </button>
              {' · '}
              <button type="button" className="at-auth-link" onClick={() => resetAll()}>
                use a different email
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="at-auth-blurb">{copy.blurb}</p>

            <div className="at-auth-body">
              <input
                className="at-input at-auth-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                autoFocus
                spellCheck={false}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) requestCode();
                }}
              />
              <button
                type="button"
                className="at-btn at-btn-primary at-auth-btn"
                onClick={() => requestCode()}
                disabled={busy || !email.trim()}
              >
                {busy ? 'Sending…' : copy.cta}
              </button>
            </div>

            {error && (
              <div className="at-auth-notice" role="alert">
                <span className="at-auth-notice-glyph" aria-hidden="true">⚠</span>
                <span>
                  {error}
                  {conflict && mode === 'save' && (
                    <>
                      {' '}
                      <button type="button" onClick={() => onSwitchMode('signin')}>
                        Sign in instead?
                      </button>
                    </>
                  )}
                </span>
              </div>
            )}

            <p className="at-auth-meta">
              {copy.switchPrompt}{' '}
              <button
                type="button"
                className="at-auth-link"
                onClick={() => onSwitchMode(mode === 'save' ? 'signin' : 'save')}
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
