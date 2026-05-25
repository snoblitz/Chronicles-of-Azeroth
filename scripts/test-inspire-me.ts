/**
 * Inspire Me dogfood harness.
 *
 * Renders the Inspire Me prompt against a sample context, optionally
 * calls Gemini Flash, and pretty-prints the suggestions. Useful for
 * iterating on the prompt template without spinning up the wizard UI.
 *
 * Usage:
 *   npx tsx scripts/test-inspire-me.ts                 # print prompt only
 *   npx tsx scripts/test-inspire-me.ts --call          # also call LLM
 *   npx tsx scripts/test-inspire-me.ts --call --rolls 3  # 3 separate clicks
 *
 * Requires VITE_GEMINI_API_KEY in .env.local (or env) for --call mode.
 */

import { readFileSync, existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import {
  buildInspireMePrompt,
  parseInspireMeResponse,
  validateInspireMeContext,
  type InspireMeContext,
} from '../src/lib/inspireMePrompt';

// Inline .env.local loader -- avoids adding dotenv as a dep.
function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  const raw = readFileSync('.env.local', 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const shouldCall = args.includes('--call');
const rollsIdx = args.indexOf('--rolls');
const rolls = rollsIdx >= 0 ? parseInt(args[rollsIdx + 1] ?? '1', 10) : 1;

// Sample context modeled on Garygidney's pre-existing record (lvl X dwarf
// rogue on Earthen Ring) with a placeholder personality profile.
const baseContext: InspireMeContext = {
  character: {
    name: 'Garygidney',
    race: 'Dwarf',
    class: 'Rogue',
    sex: 2, // male
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
    {
      source: 'WoWCombatLog session (29min)',
      summary:
        'Has died once during combat near Coldridge Valley troggs. Prefers melee engagement. Did not retreat first.',
    },
  ],
  currentQuestion:
    'What brought your character out of their homeland and into the wider world?',
  clickIndex: 0,
};

function divider(label: string) {
  console.log('\n' + '='.repeat(72));
  console.log(label);
  console.log('='.repeat(72));
}

async function runOnce(clickIndex: number) {
  const ctx = { ...baseContext, clickIndex };
  const errors = validateInspireMeContext(ctx);
  if (errors.length > 0) {
    console.error('Validation errors:', errors);
    process.exit(1);
  }
  const prompt = buildInspireMePrompt(ctx);

  divider(`PROMPT (clickIndex=${clickIndex})`);
  console.log(prompt);

  if (!shouldCall) return;

  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('\n[ERROR] VITE_GEMINI_API_KEY not set. Add it to .env.local or skip --call.');
    process.exit(1);
  }
  const client = new GoogleGenAI({ apiKey });

  divider(`LLM RESPONSE (clickIndex=${clickIndex})`);
  const start = performance.now();
  const result = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      maxOutputTokens: 800,
      temperature: 0.9,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const latencyMs = Math.round(performance.now() - start);
  const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  console.log(`(latency: ${latencyMs}ms, input tokens: ${result.usageMetadata?.promptTokenCount}, output tokens: ${result.usageMetadata?.candidatesTokenCount})\n`);
  console.log('Raw output:\n' + raw);

  try {
    const parsed = parseInspireMeResponse(raw);
    divider(`PARSED SUGGESTIONS (clickIndex=${clickIndex})`);
    parsed.suggestions.forEach((s, i) => {
      console.log(`\n[${i + 1}] "${s.title}"`);
      console.log(s.text);
      const wordCount = s.text.trim().split(/\s+/).length;
      console.log(`    (${wordCount} words)`);
    });
  } catch (e) {
    console.error('\nParse failed:', (e as Error).message);
  }
}

async function main() {
  for (let i = 0; i < rolls; i++) {
    await runOnce(i);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
