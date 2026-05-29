import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

// Segmented one-time-code input: N single-char boxes that auto-advance as you
// type, backspace to the previous box, accept a pasted code, and fire
// onComplete when full. Alphanumeric (A-Z + 0-9); we normalize to uppercase
// as we accept so the user can paste a mixed-case code from email and it just
// works. The whole code is held by the parent as a single string (`value`);
// this component is purely presentational over it.

const ALNUM_NOT = /[^A-Za-z0-9]/g;
const normalize = (s: string) => s.replace(ALNUM_NOT, '').toUpperCase();

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({ length, value, onChange, onComplete, disabled, autoFocus }: OtpInputProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number>(-1);

  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  function focusBox(i: number) {
    const idx = Math.max(0, Math.min(length - 1, i));
    const el = boxes.current[idx];
    el?.focus();
    el?.select();
  }

  function commit(joined: string) {
    const cleaned = normalize(joined).slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
    return cleaned;
  }

  function handleChange(i: number, raw: string) {
    const cleaned = normalize(raw);
    if (cleaned === '') return; // empties are handled by Backspace in keydown
    const arr = chars.slice();
    if (cleaned.length === 1) {
      arr[i] = cleaned;
      commit(arr.join(''));
      if (i < length - 1) focusBox(i + 1);
    } else {
      // Fast-typed or autofilled multiple chars — fill forward from this box.
      let j = i;
      for (const c of cleaned) {
        if (j >= length) break;
        arr[j] = c;
        j++;
      }
      commit(arr.join(''));
      focusBox(j);
    }
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = chars.slice();
      if (arr[i]) {
        arr[i] = '';
        commit(arr.join(''));
      } else if (i > 0) {
        arr[i - 1] = '';
        commit(arr.join(''));
        focusBox(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const cleaned = commit(e.clipboardData.getData('text'));
    focusBox(Math.min(cleaned.length, length - 1));
  }

  return (
    <div
      role="group"
      aria-label={`${length}-character code`}
      style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}
    >
      {chars.map((c, i) => {
        const isFocused = focused === i;
        return (
          <input
            key={i}
            ref={(el) => { boxes.current[i] = el; }}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={c}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            aria-label={`Digit ${i + 1} of ${length}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => { setFocused(i); e.target.select(); }}
            onBlur={() => setFocused((f) => (f === i ? -1 : f))}
            style={{
              width: 42,
              height: 54,
              textAlign: 'center',
              fontSize: 24,
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--gold-bright, #f0c896)',
              background: 'var(--at-bg, #15110d)',
              border: `1px solid ${isFocused ? 'var(--gold, #d4a373)' : 'var(--gold-deep, #3a2c1c)'}`,
              borderRadius: 'var(--r-md, 6px)',
              outline: 'none',
              boxShadow: isFocused ? '0 0 0 1px var(--gold, #d4a373), 0 0 12px rgba(212,163,115,0.25)' : 'none',
              transition: 'border-color 120ms ease, box-shadow 120ms ease',
              caretColor: 'var(--gold-bright, #f0c896)',
            }}
          />
        );
      })}
    </div>
  );
}
