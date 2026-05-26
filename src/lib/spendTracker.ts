// ============================================================================
// Spend tracker — localStorage-backed usage log + derived averages.
// Phase 1 will migrate the storage layer to SQLite; the API stays the same.
// ============================================================================

import { v4 as uuid } from 'uuid';
import type { TaskAverages, UsageRecord } from '../types';

const STORAGE_KEY_PREFIX = 'at.spend.';
export const SPEND_RETENTION_DAYS = 90;

function dateKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}${yyyy}-${mm}-${dd}`;
}

function loadDay(key: string): UsageRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as UsageRecord[];
  } catch (err) {
    console.warn(`[spendTracker] Failed to parse ${key}:`, err);
    return [];
  }
}

function saveDay(key: string, records: UsageRecord[]): void {
  localStorage.setItem(key, JSON.stringify(records));
}

export function recordUsage(record: Omit<UsageRecord, 'id'>): UsageRecord {
  const full: UsageRecord = { ...record, id: uuid() };
  const key = dateKey(record.timestamp);
  const day = loadDay(key);
  day.push(full);
  saveDay(key, day);
  // Notify in-tab subscribers (the native 'storage' event only fires for other tabs).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('at:usage-updated', { detail: full }));
  }
  return full;
}

export function loadRecentRecords(days = 7): UsageRecord[] {
  const out: UsageRecord[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const key = dateKey(now - i * 86_400_000);
    out.push(...loadDay(key));
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function loadTodayRecords(): UsageRecord[] {
  return loadDay(dateKey());
}

export function purgeOldRecords(): number {
  const cutoff = Date.now() - SPEND_RETENTION_DAYS * 86_400_000;
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
    const datePart = key.slice(STORAGE_KEY_PREFIX.length);
    const ts = Date.parse(datePart);
    if (!Number.isNaN(ts) && ts < cutoff) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  return keysToRemove.length;
}

// ----------------------------------------------------------------------------
// Aggregations (the forecasting goldmine)
// ----------------------------------------------------------------------------

export function computeAverages(records: UsageRecord[]): TaskAverages[] {
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    const key = `${r.task}::${r.model}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .map(([key, recs]) => {
      const [task, model] = key.split('::');
      return {
        task: task as TaskAverages['task'],
        model,
        calls: recs.length,
        avgInput: avg(recs.map((r) => r.inputTokens)),
        avgCached: avg(recs.map((r) => r.cachedInputTokens)),
        avgOutput: avg(recs.map((r) => r.outputTokens)),
        avgCostUsd: avg(recs.map((r) => r.costUsd)),
        totalCostUsd: sum(recs.map((r) => r.costUsd)),
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export function sumCost(records: UsageRecord[]): number {
  return records.reduce((acc, r) => acc + r.costUsd, 0);
}

export function exportCsv(records: UsageRecord[]): string {
  const header = 'timestamp,provider,model,task,tier,inputTokens,cachedInputTokens,outputTokens,costUsd,latencyMs';
  const rows = records.map((r) =>
    [
      new Date(r.timestamp).toISOString(),
      r.provider,
      r.model,
      r.task,
      r.tier,
      r.inputTokens,
      r.cachedInputTokens,
      r.outputTokens,
      r.costUsd.toFixed(6),
      r.latencyMs ?? '',
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

// ----------------------------------------------------------------------------

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
