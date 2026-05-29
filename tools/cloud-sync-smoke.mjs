// ============================================================================
// Cloud-sync data-layer smoke test.
//
// Exercises the exact Supabase contract that src/lib/cloudSync.ts depends on,
// against the real linked project, WITHOUT a browser:
//   - character insert + bible bundle upsert (the per-character jsonb bundle)
//   - the nested read shape the engine uses: characters.select('id, bible(data)')
//   - last-write-wins: a second upsert with a higher modifiedAt replaces the row
//   - cascade delete: deleting the character removes its bible row
//
//   node tools/cloud-sync-smoke.mjs      (or: npm run sync:smoke)
//
// Prereqs (same as auth:smoke):
//   - Anonymous sign-ins enabled
//   - Initial schema migration applied (characters + bible + RLS + cascade)
//
// Exit code 0 = all assertions passed, 1 = something failed.
// Cleans up after itself; leaves one orphaned anon user behind (acceptable).
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // no .env.local — rely on process.env
  }
  return env;
}

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Mirror of the bundle the engine writes into bible.data.
function makeBundle(createdAtKey, modifiedAt, { recapCount = 1 } = {}) {
  const sessionRecaps = {};
  for (let i = 0; i < recapCount; i++) {
    sessionRecaps[`s${i}`] = { text: `recap ${i}`, savedAt: modifiedAt - i };
  }
  return {
    sync: { schemaVersion: 1, createdAtKey, modifiedAt, pushedAt: Date.now() },
    bible: {
      name: 'Smoketest Hero',
      race: 'Dwarf',
      class: 'Warrior',
      faction: 'Alliance',
      backstory: 'Born in a smoke test.',
      beliefs: [],
      motivations: [],
      voice: 'gruff',
      realm: 'Smoke',
      level: 10,
      coreQuote: 'Tested, therefore real.',
      createdAt: Number(createdAtKey),
      updatedAt: modifiedAt,
    },
    enrichments: { e0: { paragraph: 'A vivid paragraph.', savedAt: modifiedAt } },
    sessionRecaps,
  };
}

// Same extraction the engine uses — tolerate object-or-array embed shape.
function extractBundle(row) {
  const bibleField = row?.bible;
  const rec = Array.isArray(bibleField) ? bibleField[0] : bibleField;
  const data = rec?.data;
  return data && typeof data === 'object' ? data : null;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (env or .env.local).');
    process.exit(2);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nCloud-sync data-layer smoke test → ${url}\n`);

  // Session + profile (FK prereq for characters.owner_id).
  const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
  if (anonErr || !anon?.user) {
    console.error('\nCannot continue without a session (is anonymous sign-in enabled?).\n');
    process.exit(1);
  }
  const uid = anon.user.id;
  await supabase.from('profiles').upsert({ id: uid }, { onConflict: 'id', ignoreDuplicates: true });
  console.log(`Anon uid ${uid.slice(0, 8)}…\n`);

  const createdAtKey = String(Date.now());
  let characterId = null;

  // 1. Insert character + upsert bible bundle (the push path).
  console.log('Push (character + bible bundle)');
  const v1 = makeBundle(createdAtKey, 1000, { recapCount: 2 });
  const { data: ins, error: insErr } = await supabase
    .from('characters')
    .insert({
      owner_id: uid,
      name: v1.bible.name,
      realm: v1.bible.realm,
      class: v1.bible.class,
      race: v1.bible.race,
      level: v1.bible.level,
      core_quote: v1.bible.coreQuote,
    })
    .select('id')
    .single();
  check('character insert succeeds', !insErr && !!ins, insErr?.message);
  characterId = ins?.id;

  if (characterId) {
    const { error: bErr } = await supabase
      .from('bible')
      .upsert({ character_id: characterId, data: v1 }, { onConflict: 'character_id' });
    check('bible bundle upsert succeeds', !bErr, bErr?.message);
  }

  // 2. Pull path: read back via the engine's nested select shape.
  console.log('\nPull (engine read shape)');
  const { data: rows, error: readErr } = await supabase
    .from('characters')
    .select('id, bible(data)')
    .eq('owner_id', uid);
  check("characters.select('id, bible(data)') succeeds", !readErr, readErr?.message);
  const row = (rows ?? []).find((r) => r.id === characterId);
  const got = extractBundle(row);
  check('embedded bible.data is extractable', !!got);
  check('round-trips createdAtKey', got?.sync?.createdAtKey === createdAtKey,
    `got ${got?.sync?.createdAtKey}`);
  check('round-trips modifiedAt (LWW comparator)', got?.sync?.modifiedAt === 1000,
    `got ${got?.sync?.modifiedAt}`);
  check('round-trips 2 session recaps', Object.keys(got?.sessionRecaps ?? {}).length === 2);
  check('round-trips 1 enrichment', Object.keys(got?.enrichments ?? {}).length === 1);

  // 3. LWW: a newer bundle replaces the old one in place (single row).
  console.log('\nLast-write-wins (newer upsert replaces)');
  const v2 = makeBundle(createdAtKey, 2000, { recapCount: 3 });
  const { error: upErr } = await supabase
    .from('bible')
    .upsert({ character_id: characterId, data: v2 }, { onConflict: 'character_id' });
  check('newer bible upsert succeeds', !upErr, upErr?.message);
  const { data: after } = await supabase
    .from('bible')
    .select('data')
    .eq('character_id', characterId)
    .single();
  check('modifiedAt advanced to 2000', after?.data?.sync?.modifiedAt === 2000,
    `got ${after?.data?.sync?.modifiedAt}`);
  check('recap count grew to 3 (in-place replace, no dup row)',
    Object.keys(after?.data?.sessionRecaps ?? {}).length === 3);

  // 4. Cascade delete: removing the character removes its bible row.
  console.log('\nCascade delete');
  if (characterId) {
    const { error: delErr } = await supabase.from('characters').delete().eq('id', characterId);
    check('character delete succeeds', !delErr, delErr?.message);
    const { data: orphan } = await supabase
      .from('bible')
      .select('character_id')
      .eq('character_id', characterId)
      .maybeSingle();
    check('bible row cascade-deleted (no zombie)', !orphan);
  }

  await supabase.auth.signOut();
  console.log(`\n${failed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nUnexpected error:', e);
  process.exit(1);
});
