/**
 * Inspire Me API end-to-end dogfood.
 *
 * Polyfills localStorage so the real GeminiProvider works in Node, then
 * fires the generateInspireMe() entry point and verifies spend tracking
 * also lit up. This is the path the wizard UI will actually take.
 *
 *   npx tsx scripts/test-inspire-me-api.ts
 */

import { readFileSync, existsSync } from 'node:fs';

// --- env load ---
function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

// --- localStorage polyfill ---
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

// imports after polyfill so spendTracker sees localStorage
const { GeminiProvider } = await import('../src/providers/GeminiProvider');
const { generateInspireMe } = await import('../src/lib/inspireMe');
const { loadRecentRecords } = await import('../src/lib/spendTracker');
import type { InspireMeContext } from '../src/lib/inspireMePrompt';

const apiKey = process.env.VITE_GEMINI_API_KEY;
if (!apiKey) { console.error('VITE_GEMINI_API_KEY missing'); process.exit(1); }

const provider = new GeminiProvider(apiKey);

const ctx: InspireMeContext = {
  character: {
    name: 'Garygidney',
    race: 'Dwarf',
    class: 'Rogue',
    sex: 2,
    faction: 'Alliance',
    classification: 'pre-existing',
    level: 5,
    zone: 'Dun Morogh',
    subzone: 'New Tinkertown',
  },
  profile: {
    disposition: 'cynical',
    moralCompass: 'pragmatic',
    socialStyle: 'suspicious',
    drive: 'coin',
    flaw: 'greedy',
    chosenAt: Math.floor(Date.now() / 1000),
    source: 'wizard',
  },
  intel: [
    { source: 'WoWCombatLog session (29min)', summary: 'Died once near Coldridge troggs; engages melee, did not retreat first.' },
  ],
  currentQuestion: 'What brought your character out of their homeland and into the wider world?',
  clickIndex: 0,
};

console.log('Calling generateInspireMe via GeminiProvider...\n');
const result = await generateInspireMe(ctx, provider);

console.log(`Latency: ${result.latencyMs.toFixed(0)}ms`);
console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
console.log(`Prompt version: ${result.promptVersion}\n`);

result.suggestions.forEach((s, i) => {
  const wc = s.text.trim().split(/\s+/).length;
  console.log(`[${i + 1}] "${s.title}" (${wc} words)`);
  console.log(`    ${s.text}\n`);
});

// Verify spend tracker captured it
const recent = loadRecentRecords(1);
const inspireRecords = recent.filter((r) => r.task === 'inspire-me');
console.log(`\nSpend tracker: ${inspireRecords.length} inspire-me record(s), cost $${inspireRecords.reduce((a, r) => a + r.costUsd, 0).toFixed(6)}`);

if (inspireRecords.length === 0) {
  console.error('FAIL: spend tracker did not record the call');
  process.exit(1);
}
console.log('\nOK -- end-to-end API path verified.');
