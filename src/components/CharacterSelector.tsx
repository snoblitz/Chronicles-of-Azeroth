import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type BibleRosterEntry,
  clearBible,
  deleteBible,
  listBibles,
  setActiveBible,
} from '../lib/bibleStore';

export function CharacterSelector() {
  const [roster, setRoster] = useState<BibleRosterEntry[]>(() => listBibles());
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const refresh = () => setRoster(listBibles());
    window.addEventListener('at:bible-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('at:bible-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const active = useMemo(() => roster.find((r) => r.isActive) ?? null, [roster]);
  const others = useMemo(() => roster.filter((r) => !r.isActive), [roster]);

  function handleSwitch(key: string) {
    setActiveBible(key);
    setOpen(false);
  }

  function handleNew() {
    clearBible();
    setOpen(false);
  }

  function handleDelete(entry: BibleRosterEntry) {
    const ok = window.confirm(
      `Delete ${entry.name} permanently?\n\nThis erases the character bible AND all NPC conversations for this hero. This cannot be undone.`,
    );
    if (!ok) return;
    deleteBible(entry.key);
  }

  if (roster.length === 0) {
    return (
      <div className="at-char-selector">
        <span className="at-char-selector-label">No hero yet — start one below.</span>
      </div>
    );
  }

  return (
    <div className="at-char-selector" ref={popRef}>
      <button
        type="button"
        className="at-char-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Switch character or start a new one"
      >
        <span className="at-char-selector-label">Playing as</span>
        <span className="at-char-selector-name">
          {active ? active.name : 'No active hero'}
        </span>
        {active && (
          <span className="at-char-selector-meta">
            {active.race} {active.class} · {active.faction}
          </span>
        )}
        <span className="at-char-selector-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="at-char-selector-menu" role="menu">
          {active && (
            <div className="at-char-selector-section at-char-selector-active">
              <div className="at-char-selector-section-label">Active</div>
              <div className="at-char-selector-row">
                <div className="at-char-selector-row-main">
                  <div className="at-char-selector-row-name">{active.name}</div>
                  <div className="at-char-selector-row-meta">
                    {active.race} {active.class} · {active.faction}
                  </div>
                </div>
                <button
                  type="button"
                  className="at-char-selector-row-delete"
                  onClick={() => handleDelete(active)}
                  title={`Delete ${active.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="at-char-selector-section">
              <div className="at-char-selector-section-label">Other heroes</div>
              {others.map((entry) => (
                <div key={entry.key} className="at-char-selector-row">
                  <button
                    type="button"
                    className="at-char-selector-row-main at-char-selector-row-switch"
                    onClick={() => handleSwitch(entry.key)}
                    title={`Switch to ${entry.name}`}
                  >
                    <div className="at-char-selector-row-name">{entry.name}</div>
                    <div className="at-char-selector-row-meta">
                      {entry.race} {entry.class} · {entry.faction}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="at-char-selector-row-delete"
                    onClick={() => handleDelete(entry)}
                    title={`Delete ${entry.name}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="at-char-selector-section">
            <button
              type="button"
              className="at-char-selector-new"
              onClick={handleNew}
            >
              + New character
            </button>
            <div className="at-char-selector-foot">
              Your current hero stays saved. Switch back any time.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
