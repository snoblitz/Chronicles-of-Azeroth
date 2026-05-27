import { useEffect, useRef, useState } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { SaveChronicleModal, type AuthModalMode } from './SaveChronicleModal';

// Top-right account control for the app shell. Anonymous-by-default: account
// creation is framed as preserving the chronicle, never as a gate.
export function AccountMenu() {
  const { status, email } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AuthModalMode>('save');
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // No Supabase configured (e.g. the current public build) → render nothing.
  if (status === 'disabled') return null;

  function openModal(mode: AuthModalMode) {
    setModalMode(mode);
    setModalOpen(true);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      {status === 'loading' && (
        <span
          aria-hidden
          style={{
            display: 'inline-block', width: 116, height: 30, borderRadius: 'var(--r-md)',
            background: 'rgba(255,240,200,0.06)',
          }}
        />
      )}

      {status === 'anonymous' && (
        <>
          <button type="button" className="at-btn at-btn-primary at-btn-sm" onClick={() => openModal('save')}>
            Save your chronicle
          </button>
          <button
            type="button"
            onClick={() => openModal('signin')}
            style={{
              background: 'none', border: 'none', padding: 0, font: 'inherit',
              color: 'var(--fg-muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13,
            }}
          >
            Sign in
          </button>
        </>
      )}

      {status === 'authed' && (
        <>
          <button
            type="button"
            className="at-btn at-btn-secondary at-btn-sm"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={email ?? 'Account'}
          >
            <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ◆ {email}
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
                minWidth: 180, padding: '0.4rem', borderRadius: 'var(--r-md)',
                background: 'var(--panel, #1c1710)', border: '1px solid rgba(255,240,200,0.12)',
                boxShadow: 'var(--sh-panel)',
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="at-btn at-btn-secondary at-btn-sm"
                style={{ width: '100%' }}
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </>
      )}

      <SaveChronicleModal
        open={modalOpen}
        mode={modalMode}
        onClose={() => setModalOpen(false)}
        onSwitchMode={(m) => setModalMode(m)}
      />
    </div>
  );
}
