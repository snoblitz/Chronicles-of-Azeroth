/**
 * SV parser dogfood harness.
 *
 * Parses our real capture-02-retail.lua and prints a structural summary.
 * If the file shape ever changes, this is the canary.
 *
 *   npx tsx scripts/test-sv-parser.ts                  # default capture
 *   npx tsx scripts/test-sv-parser.ts path/to/file.lua # custom path
 */

import { readFileSync } from 'node:fs';
import { parseSavedVariables, type LuaValue } from '../src/lib/luaSavedVariables';

const DEFAULT_PATH =
  'C:\\Users\\snobl\\.copilot\\session-state\\b7129617-feb7-4581-965d-58cddfb1c65e\\files\\capture-02-retail.lua';
const path = process.argv[2] ?? DEFAULT_PATH;

function describe(v: LuaValue, depth = 0): string {
  if (v === null) return 'nil';
  if (typeof v === 'string') return `string(${v.length})`;
  if (typeof v === 'number' || typeof v === 'boolean') return typeof v;
  if (Array.isArray(v)) return `array[${v.length}]`;
  return `object{${Object.keys(v).length} keys}`;
}

function summarize(label: string, v: LuaValue) {
  console.log(`  ${label}: ${describe(v)}`);
  if (Array.isArray(v) && v.length > 0) {
    console.log(`    [0] = ${describe(v[0])}`);
    if (typeof v[0] === 'object' && v[0] !== null && !Array.isArray(v[0])) {
      console.log(`         keys: ${Object.keys(v[0] as object).join(', ')}`);
    }
  } else if (v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v);
    for (const [k, vv] of entries.slice(0, 8)) {
      console.log(`    .${k} = ${describe(vv)}`);
    }
    if (entries.length > 8) console.log(`    ... ${entries.length - 8} more keys`);
  }
}

console.log(`Reading: ${path}`);
const src = readFileSync(path, 'utf-8');
console.log(`File size: ${src.length} bytes, ${src.split('\n').length} lines\n`);

const start = performance.now();
const result = parseSavedVariables(src);
const elapsed = performance.now() - start;
console.log(`Parsed in ${elapsed.toFixed(1)}ms\n`);

for (const [varName, value] of Object.entries(result)) {
  console.log(`${varName} (${describe(value)}):`);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      summarize(k, v);
    }
  }
}

// Spot-check on the events array
const db = result.ChroniclesOfAzerothDB;
if (db && typeof db === 'object' && !Array.isArray(db)) {
  const events = (db as Record<string, LuaValue>).events;
  if (Array.isArray(events)) {
    console.log(`\nFirst event:`);
    console.log(JSON.stringify(events[0], null, 2));
    console.log(`\nLast event:`);
    console.log(JSON.stringify(events[events.length - 1], null, 2));

    const counts = (db as Record<string, LuaValue>).counts;
    if (counts && typeof counts === 'object') {
      const total = Object.values(counts as Record<string, number>).reduce(
        (a, b) => a + (typeof b === 'number' ? b : 0),
        0,
      );
      console.log(`\nSum of counts: ${total} (events array length: ${events.length})`);
    }
  }
}
