import { useMemo, useState, useEffect } from 'react';
import {
  computeAverages,
  exportCsv,
  loadTodayRecords,
  purgeOldRecords,
  SPEND_RETENTION_DAYS,
  sumCost,
} from '../lib/spendTracker';

interface SpendBarProps {
  onOpenSettings?: () => void;
  hasAnyKey?: boolean;
}

export function SpendBar({ onOpenSettings, hasAnyKey = true }: SpendBarProps = {}) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

  // Re-read on storage events (other tabs) AND custom in-tab events.
  useEffect(() => {
    const handler = () => setTick((n) => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('at:usage-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('at:usage-updated', handler);
    };
  }, []);

  const records = useMemo(() => loadTodayRecords(), [tick]);
  const today = useMemo(() => sumCost(records), [records]);
  const averages = useMemo(() => computeAverages(records), [records]);
  const lastCall = records.at(-1);

  const todayColor = today > 1 ? '#e85d4d' : today > 0.5 ? '#e8c14d' : '#7dd87a';

  function handleExport() {
    const csv = exportCsv(records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `at-spend-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePurgeOldRecords() {
    const ok = window.confirm(
      `Remove spend-tracking buckets older than ${SPEND_RETENTION_DAYS} days?\n\n` +
      'Recent spend records, character bibles, NPC chats, and API keys will not be touched.',
    );
    if (!ok) return;

    const removed = purgeOldRecords();
    setTick((n) => n + 1);
    setHistoryMessage(
      removed === 1
        ? `Removed 1 spend bucket older than ${SPEND_RETENTION_DAYS} days.`
        : `Removed ${removed} spend buckets older than ${SPEND_RETENTION_DAYS} days.`,
    );
  }

  return (
    <div className="at-spendbar">
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer', flexWrap: 'wrap' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          <strong>Today:</strong>{' '}
          <span style={{ color: todayColor, fontWeight: 600 }}>${today.toFixed(4)}</span>
        </span>
        <span>
          <strong>Calls:</strong> {records.length}
        </span>
        {lastCall && (
          <span style={{ opacity: 0.75 }}>
            <strong>Last:</strong> {lastCall.inputTokens} in / {lastCall.outputTokens} out → $
            {lastCall.costUsd.toFixed(4)} ({lastCall.model}, {lastCall.tier})
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
          {onOpenSettings && (
            <button
              type="button"
              className={`at-btn at-btn-sm ${hasAnyKey ? 'at-btn-secondary' : 'at-btn-primary'}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              title={hasAnyKey ? 'Manage API keys' : 'Set up an API key to start using the app'}
            >
              ⚙ Keys{!hasAnyKey ? ' — set me' : ''}
            </button>
          )}
          <span style={{ opacity: 0.55 }}>{expanded ? '▼ collapse' : '▶ breakdown'}</span>
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
          {averages.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No usage yet today. Make an LLM call to see data.</p>
          ) : (
            <table className="at-spendbar-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Model</th>
                  <th style={{ textAlign: 'right' }}>Calls</th>
                  <th style={{ textAlign: 'right' }}>Avg in</th>
                  <th style={{ textAlign: 'right' }}>Avg cached</th>
                  <th style={{ textAlign: 'right' }}>Avg out</th>
                  <th style={{ textAlign: 'right' }}>Avg $</th>
                  <th style={{ textAlign: 'right' }}>Total $</th>
                </tr>
              </thead>
              <tbody>
                {averages.map((a) => (
                  <tr key={`${a.task}::${a.model}`}>
                    <td>{a.task}</td>
                    <td>{a.model}</td>
                    <td style={{ textAlign: 'right' }}>{a.calls}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgInput.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgCached.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>{a.avgOutput.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>${a.avgCostUsd.toFixed(5)}</td>
                    <td style={{ textAlign: 'right' }}>${a.totalCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExport();
              }}
            >
              Export CSV
            </button>
            <button
              className="at-btn at-btn-secondary at-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                handlePurgeOldRecords();
              }}
              title={`Remove only spend buckets older than ${SPEND_RETENTION_DAYS} days`}
            >
              Purge old spend records
            </button>
          </div>
          {historyMessage && (
            <p style={{ opacity: 0.65, margin: '0.5rem 0 0', fontSize: 12 }}>
              {historyMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
