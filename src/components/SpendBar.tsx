import { useMemo, useState, useEffect } from 'react';
import {
  computeAverages,
  exportCsv,
  loadTodayRecords,
  sumCost,
} from '../lib/spendTracker';

export function SpendBar() {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Re-read on storage events (other tabs) AND custom in-tab events.
  useEffect(() => {
    const handler = () => setTick((n) => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('coa:usage-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('coa:usage-updated', handler);
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
    a.download = `coa-spend-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="coa-spendbar">
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
        <span style={{ marginLeft: 'auto', opacity: 0.55 }}>
          {expanded ? '▼ collapse' : '▶ breakdown'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
          {averages.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No usage yet today. Make an LLM call to see data.</p>
          ) : (
            <>
              <table className="coa-spendbar-table">
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
              <button
                className="coa-btn coa-btn-secondary coa-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport();
                }}
                style={{ marginTop: '0.75rem' }}
              >
                Export CSV
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
