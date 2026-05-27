/**
 * ManualEntryDialog — a rich composer for adding a chronicle entry by hand.
 *
 * Pills set in-the-moment context (level, zone, quest, companions, mood).
 * Level/zone changes write back to the bible so future entries stay current.
 * Quest/companions/mood ride along as a short italic prefix on the entry text
 * so the chronicle reader and recap prompts pick them up for free.
 *
 * The ✦ Ask the Loremaster button polishes spelling/grammar/voice via the
 * user's selected model. The user keeps an "Undo polish" escape hatch.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterBible } from '../types';
import { appendHistoryEntry, updateActiveBible } from '../lib/bibleStore';
import { getApiKey } from '../lib/apiKeys';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import {
  LoremasterPolishError,
  polishChronicleEntry,
} from '../lib/loremasterPolish';

const MOODS: { id: string; label: string; glyph: string }[] = [
  { id: 'Triumph', label: 'Triumph', glyph: '⚔' },
  { id: 'Defeat', label: 'Defeat', glyph: '💀' },
  { id: 'Wonder', label: 'Wonder', glyph: '✨' },
  { id: 'Quiet', label: 'Quiet', glyph: '🌫' },
  { id: 'Fury', label: 'Fury', glyph: '🔥' },
  { id: 'Comic', label: 'Comic', glyph: '😂' },
];

interface ManualEntryDialogProps {
  bible: CharacterBible;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ManualEntryDialog({
  bible,
  open,
  onClose,
  onSaved,
}: ManualEntryDialogProps) {
  const [level, setLevel] = useState<string>(
    typeof bible.level === 'number' ? String(bible.level) : '',
  );
  const [zone, setZone] = useState<string>(bible.currentZone ?? '');
  const [quest, setQuest] = useState('');
  const [companions, setCompanions] = useState('');
  const [mood, setMood] = useState<string>('');
  const [text, setText] = useState('');
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishedFrom, setPolishedFrom] = useState<string | null>(null);
  const [modelIdx] = useSelectedModelIdx();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasKey = !!getApiKey('openrouter');
  const canSave = text.trim().length > 0;

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setLevel(typeof bible.level === 'number' ? String(bible.level) : '');
    setZone(bible.currentZone ?? '');
    setQuest('');
    setCompanions('');
    setMood('');
    setText('');
    setPolishedFrom(null);
    setPolishError(null);
    // Focus the body text after the modal mounts.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open, bible.level, bible.currentZone]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handlePolish() {
    if (!hasKey) return;
    if (!text.trim()) return;
    setPolishError(null);
    setPolishing(true);
    const previous = text;
    try {
      const choice = MODEL_CHOICES[modelIdx];
      const provider = await choice.factory();
      const parsedLevel = level.trim() === '' ? undefined : Number(level);
      const result = await polishChronicleEntry(
        text,
        {
          bible,
          level: Number.isFinite(parsedLevel as number)
            ? (parsedLevel as number)
            : undefined,
          zone: zone.trim() || undefined,
          quest: quest.trim() || undefined,
          companions: companions.trim() || undefined,
          mood: mood || undefined,
        },
        provider,
        choice.pricingKey,
      );
      setPolishedFrom(previous);
      setText(result.polished);
    } catch (e) {
      const msg =
        e instanceof LoremasterPolishError
          ? e.message
          : `The Loremaster stumbled: ${(e as Error).message}`;
      setPolishError(msg);
    } finally {
      setPolishing(false);
    }
  }

  function handleUndoPolish() {
    if (polishedFrom == null) return;
    setText(polishedFrom);
    setPolishedFrom(null);
  }

  function handleSave() {
    const body = text.trim();
    if (!body) return;

    // Write level/zone back to the bible so the entry snapshot + future
    // entries are accurate. Only patch when changed.
    const patch: Partial<CharacterBible> = {};
    const parsedLevel = level.trim() === '' ? undefined : Number(level);
    if (
      typeof parsedLevel === 'number' &&
      Number.isFinite(parsedLevel) &&
      parsedLevel !== bible.level
    ) {
      patch.level = parsedLevel;
    }
    const zoneTrim = zone.trim();
    if (zoneTrim && zoneTrim !== bible.currentZone) {
      patch.currentZone = zoneTrim;
    }
    if (Object.keys(patch).length > 0) {
      updateActiveBible(patch);
    }

    // Build the entry text. Prepend a small italic context line so quest /
    // companions / mood survive without changing the HistoryEntry shape.
    const ctxBits: string[] = [];
    if (quest.trim()) ctxBits.push(`Quest: ${quest.trim()}`);
    if (companions.trim()) ctxBits.push(`With: ${companions.trim()}`);
    if (mood) {
      const m = MOODS.find((x) => x.id === mood);
      if (m) ctxBits.push(`${m.glyph} ${m.label}`);
    }
    const finalText =
      ctxBits.length > 0 ? `_${ctxBits.join(' · ')}_\n\n${body}` : body;

    appendHistoryEntry(finalText);
    onSaved?.();
    onClose();
  }

  const modal = (
    <div
      className="at-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-entry-title"
    >
      <div
        className="at-modal at-manual-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="at-modal-header">
          <h2 id="manual-entry-title">✦ Chronicle a deed</h2>
          <button
            className="at-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="at-manual-encourage">
          Write it the way it happened — fragments, typos, all of it. The
          <strong> Loremaster</strong> can polish your spelling, grammar, and
          rhythm before you save. Nothing gets invented; your words stay yours.
        </p>

        <div className="at-manual-pills">
          <label className="at-manual-pill">
            <span className="at-manual-pill-label">Level</span>
            <input
              className="at-manual-pill-input at-manual-pill-input-num"
              type="number"
              inputMode="numeric"
              min={1}
              max={80}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="—"
            />
          </label>
          <label className="at-manual-pill">
            <span className="at-manual-pill-label">Zone</span>
            <input
              className="at-manual-pill-input"
              type="text"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Westfall"
            />
          </label>
          <label className="at-manual-pill">
            <span className="at-manual-pill-label">Quest</span>
            <input
              className="at-manual-pill-input"
              type="text"
              value={quest}
              onChange={(e) => setQuest(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="at-manual-pill">
            <span className="at-manual-pill-label">With</span>
            <input
              className="at-manual-pill-input"
              type="text"
              value={companions}
              onChange={(e) => setCompanions(e.target.value)}
              placeholder="optional — companions, party, etc."
            />
          </label>
        </div>

        <div className="at-manual-mood">
          <span className="at-manual-pill-label">Tone</span>
          <div className="at-manual-mood-chips">
            {MOODS.map((m) => {
              const active = mood === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`at-manual-mood-chip${active ? ' at-manual-mood-chip-active' : ''}`}
                  onClick={() => setMood(active ? '' : m.id)}
                >
                  <span className="at-manual-mood-glyph">{m.glyph}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="at-manual-body">
          <textarea
            ref={textareaRef}
            className="at-input at-manual-textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Any manual edit invalidates the "undo polish" affordance.
              if (polishedFrom != null) setPolishedFrom(null);
            }}
            placeholder="What happened? Don't worry about spelling, punctuation, or making it sound good — the Loremaster has you."
            rows={10}
          />
        </div>

        {polishError && (
          <p className="at-manual-error" role="alert">
            {polishError}
          </p>
        )}

        <div className="at-manual-loremaster">
          <button
            type="button"
            className="at-btn at-btn-loremaster"
            onClick={handlePolish}
            disabled={!hasKey || !canSave || polishing}
            title={
              !hasKey
                ? 'Add your OpenRouter key in ⚙ Settings to summon the Loremaster.'
                : !canSave
                  ? 'Write something first.'
                  : 'Polish spelling, grammar, and voice. No new facts added.'
            }
          >
            {polishing ? '✦ Polishing…' : '✦ Ask the Loremaster'}
          </button>
          {polishedFrom != null && !polishing && (
            <button
              type="button"
              className="at-btn at-btn-secondary at-manual-undo"
              onClick={handleUndoPolish}
            >
              ↶ Restore my draft
            </button>
          )}
          {!hasKey && (
            <span className="at-manual-loremaster-hint muted">
              Add a key in ⚙ Settings to enable the Loremaster.
            </span>
          )}
        </div>

        <div className="at-modal-footer">
          <button className="at-btn at-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="at-btn at-btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            ◆ Save chronicle entry
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
