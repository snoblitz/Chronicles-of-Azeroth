// ============================================================================
// SpendBar — the always-visible HUD strip at the top of the app shell.
//
// Two surfaces in one component:
//
//   1. Public (everyone, always): token-only summary. We deliberately do NOT
//      show a dollar estimate here in prod — pricing tables drift, the user's
//      account may have OpenRouter credits/promos we can't see, and BYOK users
//      trust their *actual* OpenRouter dashboard, not our guess. The token
//      counts (input + output, calls) are the same numbers OpenRouter logs,
//      so a user can copy-paste these into their dashboard and reconcile.
//
//   2. Dev-only (DEV_TOOLS_ENABLED = `npm run dev`): everything from the old
//      bar — colored $ estimate, expandable per-task breakdown with cost
//      columns, Export CSV, Purge old buckets. This is the original Phase-0
//      debug instrument; it stays useful for us, but never ships to users.
// ============================================================================

import { useMemo, useState, useEffect } from 'react';
import {
  computeAverages,
  exportCsv,
  loadTodayRecords,
  purgeOldRecords,
  SPEND_RETENTION_DAYS,
  sumCost,
} from '../lib/spendTracker';
import { MODEL_CHOICES, useSelectedModelIdx } from '../lib/modelChoices';
import { DEV_TOOLS_ENABLED } from '../lib/devTools';
import { assetUrl } from '../lib/assetUrl';

interface SpendBarProps {
  onOpenSettings?: () => void;
  hasAnyKey?: boolean;
}

export function SpendBar({ onOpenSettings, hasAnyKey = true }: SpendBarProps = {}) {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [modelIdx] = useSelectedModelIdx();
  const activeModelLabel = MODEL_CHOICES[modelIdx]?.label ?? 'Model';

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
  const totals = useMemo(() => {
    let input = 0;
    let cached = 0;
    let output = 0;
    for (const r of records) {
      input += r.inputTokens;
      cached += r.cachedInputTokens;
      output += r.outputTokens;
    }
    return { input, cached, output };
  }, [records]);
  const lastCall = records.at(-1);

  // Dev-only derived data.
  const today = useMemo(() => sumCost(records), [records]);
  const averages = useMemo(() => computeAverages(records), [records]);
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

  const canExpand = DEV_TOOLS_ENABLED; // only dev gets the breakdown drawer

  return (
    <div className="at-tokenbar" role="status" aria-label="Today's token usage">
      <div
        className="at-tokenbar-row"
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
      >
        <a
          href="/"
          className="at-tokenbar-brand"
          aria-label="Aftertale — home"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={assetUrl('aftertale-logo.png')}
            alt="Aftertale"
            className="at-tokenbar-logo"
          />
        </a>

        <div className="at-tokenbar-center">
          <span className="at-tokenbar-kicker">Today</span>

          <span
            className="at-tokenbar-stat"
            title="Total input tokens sent to OpenRouter today (matches your OpenRouter dashboard)."
          >
            <span className="at-tokenbar-label">In</span>
            <span className="at-tokenbar-value">{formatTokens(totals.input)}</span>
          </span>

          <span
            className="at-tokenbar-stat"
            title="Total output tokens returned by OpenRouter today (matches your OpenRouter dashboard)."
          >
            <span className="at-tokenbar-label">Out</span>
            <span className="at-tokenbar-value">{formatTokens(totals.output)}</span>
          </span>

          <span className="at-tokenbar-stat">
            <span className="at-tokenbar-label">Calls</span>
            <span className="at-tokenbar-value">{records.length}</span>
          </span>

          {lastCall && (
            <span className="at-tokenbar-stat at-tokenbar-stat-secondary" title={`Last call: ${lastCall.task}`}>
              <span className="at-tokenbar-label">Last</span>
              <span className="at-tokenbar-value">
                {lastCall.model} · {formatTokens(lastCall.inputTokens)} in / {formatTokens(lastCall.outputTokens)} out
              </span>
            </span>
          )}

          {DEV_TOOLS_ENABLED && (
            <span
              className="at-tokenbar-stat at-tokenbar-stat-dev"
              title="Dev-only cost estimate based on src/pricing.ts — never shown to users."
            >
              <span className="at-tokenbar-label">$ (dev)</span>
              <span className="at-tokenbar-value" style={{ color: todayColor }}>
                ${today.toFixed(4)}
              </span>
            </span>
          )}
        </div>

        <div className="at-tokenbar-right">
          {onOpenSettings && (
            <button
              type="button"
              className={`at-btn at-btn-sm ${hasAnyKey ? 'at-btn-secondary' : 'at-btn-primary'}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              title={
                hasAnyKey
                  ? `Manage key & model — currently using ${activeModelLabel}`
                  : 'Set up an API key to start using the app'
              }
            >
              {hasAnyKey ? `⚙ ${activeModelLabel}` : '⚙ Keys — set me'}
            </button>
          )}

          {canExpand && (
            <span className="at-tokenbar-toggle" aria-hidden="true">
              {expanded ? '▼' : '▶'}
            </span>
          )}
        </div>
      </div>

      {!hasAnyKey ? (
        <p className="at-tokenbar-hint">
          Add your OpenRouter key in <strong>⚙ Settings</strong> to start writing. You only pay your own OpenRouter
          usage — Aftertale never charges you, and these counters match what your dashboard records.
        </p>
      ) : records.length === 0 ? (
        <p className="at-tokenbar-hint">
          Token counts will appear here as you generate. They match your{' '}
          <a href="https://openrouter.ai/activity" target="_blank" rel="noreferrer noopener">
            OpenRouter activity log
          </a>
          , so you can audit usage any time.
        </p>
      ) : null}

      {canExpand && expanded && (
        <div className="at-tokenbar-drawer">
          <p className="at-tokenbar-dev-note">
            <strong>Dev-only:</strong> cost columns use the static pricing table at <code>src/pricing.ts</code>.
            Hidden from users in production builds.
          </p>
          {averages.length === 0 ? (
            <p className="at-tokenbar-empty">No usage yet today. Make an LLM call to see data.</p>
          ) : (
            <table className="at-tokenbar-table">
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
          <div className="at-tokenbar-actions">
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
          {historyMessage && <p className="at-tokenbar-history">{historyMessage}</p>}
        </div>
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1_000) return n.toLocaleString();
  if (n < 10_000) return `${(n / 1_000).toFixed(2)}k`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
