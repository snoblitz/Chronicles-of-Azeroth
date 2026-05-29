import { useEffect, useRef, useState } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { getSyncStatus, retrySync, SYNC_STATUS_EVENT, type SyncStatus } from '../lib/cloudSync';
import { SaveChronicleModal, type AuthModalMode } from './SaveChronicleModal';
import type { SettingsSectionId } from './SettingsPanel';

interface AccountMenuProps {
  onOpenSettings?: (section?: SettingsSectionId) => void;
}

// Subscribe to the cloud-sync engine's observable status.
function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  useEffect(() => {
    const onStatus = (e: Event) => setStatus((e as CustomEvent<SyncStatus>).detail);
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    setStatus(getSyncStatus()); // re-sync in case it changed before we mounted
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
  }, []);
  return status;
}

// Small inline pill showing the live cloud-sync state next to the account button.
function SyncPill({ status }: { status: SyncStatus }) {
  if (status.state === 'idle') return null;

  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 12, lineHeight: 1, padding: '4px 8px', borderRadius: 'var(--r-md)',
    border: '1px solid transparent', whiteSpace: 'nowrap' as const,
  };

  if (status.state === 'syncing') {
    return (
      <span style={{ ...base, color: 'var(--fg-muted)', borderColor: 'rgba(255,240,200,0.12)' }} title="Backing up to the cloud…">
        ⟳ Syncing…
      </span>
    );
  }
  if (status.state === 'synced') {
    return (
      <span style={{ ...base, color: '#7fd18b', borderColor: 'rgba(127,209,139,0.25)' }} title="Your chronicle is safely backed up.">
        ✓ Backed up
      </span>
    );
  }
  // error
  return (
    <span
      style={{ ...base, color: '#e8a87c', borderColor: 'rgba(232,168,124,0.3)', cursor: 'pointer' }}
      title={status.error ? `${status.error} Click to retry.` : 'Sync failed. Click to retry.'}
      role="button"
      tabIndex={0}
      onClick={() => void retrySync()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void retrySync(); }}
    >
      ⚠ Sync failed — retry
    </span>
  );
}

// Top-right account control for the app shell. Anonymous-by-default: account
// creation is framed as preserving the chronicle, never as a gate.
export function AccountMenu({ onOpenSettings }: AccountMenuProps = {}) {
  const { status, email } = useAuth();
  const syncStatus = useSyncStatus();
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
          <button
            type="button"
            className="at-btn at-btn-primary at-btn-sm"
            onClick={() => openModal('save')}
            title="Your hero lives only in this browser until you save them. Saving ties them to an email so they survive a cleared cache or a new device."
          >
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
          <SyncPill status={syncStatus} />
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
                minWidth: 200, padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: 4,
                borderRadius: 'var(--r-md)',
                background: 'var(--panel, #1c1710)', border: '1px solid rgba(255,240,200,0.12)',
                boxShadow: 'var(--sh-panel)',
              }}
            >
              {onOpenSettings && (
                <button
                  type="button"
                  role="menuitem"
                  className="at-btn at-btn-secondary at-btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings('account');
                  }}
                >
                  ⚙ Settings…
                </button>
              )}
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
