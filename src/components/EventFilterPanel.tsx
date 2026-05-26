// ============================================================================
// EventFilterPanel — per-event-type checkbox grid used by Scribe's Desk.
// Lets the user pick which addon events get enriched before paying the LLM
// cost. Defaults track `defaultEventFilter()` in eventFilter.ts which mirrors
// the addon's `Templates.IsNarrativeEvent` list (currently 8 narrative events).
//
// Extracted from ChronicleReader.tsx in the Scribe's Desk refactor so the
// reader can stay pure-read.
// ============================================================================

import { EVENT_CATEGORIES, LOOT_QUALITY_OPTIONS, type EventFilter } from '../lib/eventFilter';

interface EventFilterPanelProps {
  filter: EventFilter;
  counts: Map<string, number>;
  unknown: string[];
  enrichableTotal: number;
  grandTotal: number;
  onToggleEvent: (name: string) => void;
  onToggleCategory: (events: string[], turnOn: boolean) => void;
  onLootMinQualityChange: (q: number) => void;
  onReset: () => void;
  disabled: boolean;
}

export function EventFilterPanel({
  filter,
  counts,
  unknown,
  enrichableTotal,
  grandTotal,
  onToggleEvent,
  onToggleCategory,
  onLootMinQualityChange,
  onReset,
  disabled,
}: EventFilterPanelProps) {
  const lootEnabled = filter.enabled.has('LOOT_OPENED');

  return (
    <details
      style={{ marginTop: '0.75rem' }}
      // Open by default so users discover the filter; once they collapse it
      // the browser remembers per-session via <details>.
      open
    >
      <summary className="muted" style={{ cursor: 'pointer' }}>
        Event filter — {enrichableTotal.toLocaleString()} of {grandTotal.toLocaleString()} events
        in this import would be enriched
        {' · '}
        <button
          type="button"
          className="at-btn-link"
          onClick={(e) => {
            e.preventDefault();
            onReset();
          }}
          disabled={disabled}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'inherit',
            textDecoration: 'underline',
            cursor: disabled ? 'default' : 'pointer',
            font: 'inherit',
          }}
        >
          Reset to defaults
        </button>
      </summary>
      {lootEnabled && (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.82rem',
          }}
        >
          <label htmlFor="at-loot-quality">Loot quality floor:</label>
          <select
            id="at-loot-quality"
            value={filter.lootMinQuality}
            onChange={(e) => onLootMinQualityChange(Number(e.target.value))}
            disabled={disabled}
          >
            {LOOT_QUALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            (LOOT_OPENED events with no items at or above this quality are skipped)
          </span>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '0.75rem',
          marginTop: '0.5rem',
        }}
      >
        {EVENT_CATEGORIES.map((cat) => {
          const allOn = cat.events.every((e) => filter.enabled.has(e));
          const noneOn = cat.events.every((e) => !filter.enabled.has(e));
          return (
            <fieldset
              key={cat.id}
              style={{
                border: '1px solid var(--cp-border, rgba(0,0,0,0.12))',
                borderRadius: '0.4rem',
                padding: '0.4rem 0.6rem 0.5rem',
                margin: 0,
              }}
            >
              <legend
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '0 0.3rem',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
                onClick={() => {
                  if (disabled) return;
                  onToggleCategory(cat.events, !allOn);
                }}
                title={allOn ? 'Click to disable all in group' : 'Click to enable all in group'}
              >
                {cat.label} {allOn ? '☑' : noneOn ? '☐' : '◪'}
              </legend>
              {cat.events.map((name) => {
                const count = counts.get(name) ?? 0;
                return (
                  <label
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.78rem',
                      lineHeight: 1.7,
                      opacity: count === 0 ? 0.55 : 1,
                    }}
                    title={count === 0 ? 'Not present in this import' : `${count} in import`}
                  >
                    <input
                      type="checkbox"
                      checked={filter.enabled.has(name)}
                      onChange={() => onToggleEvent(name)}
                      disabled={disabled}
                    />
                    <code style={{ fontSize: '0.74rem' }}>{name}</code>
                    {count > 0 && (
                      <span className="muted" style={{ marginLeft: 'auto' }}>
                        {count}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        {unknown.length > 0 && (
          <fieldset
            style={{
              border: '1px dashed var(--cp-border, rgba(0,0,0,0.18))',
              borderRadius: '0.4rem',
              padding: '0.4rem 0.6rem 0.5rem',
              margin: 0,
            }}
          >
            <legend
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '0 0.3rem',
              }}
              title="Event types in this import not declared in the addon's known categories. Probably a newer addon version."
            >
              Unknown
            </legend>
            {unknown.map((name) => {
              const count = counts.get(name) ?? 0;
              return (
                <label
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    lineHeight: 1.7,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filter.enabled.has(name)}
                    onChange={() => onToggleEvent(name)}
                    disabled={disabled}
                  />
                  <code style={{ fontSize: '0.74rem' }}>{name}</code>
                  {count > 0 && (
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      {count}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
    </details>
  );
}
