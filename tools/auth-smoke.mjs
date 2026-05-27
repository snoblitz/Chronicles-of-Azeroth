// ============================================================================
// Auth + RLS smoke test.
//
// Exercises the anonymous-by-default flow and the characters RLS policy
// against a real Supabase project. Reads VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY from the environment or .env.local.
//
//   node tools/auth-smoke.mjs      (or: npm run auth:smoke)
//
// Prereqs on the project:
//   - Anonymous sign-ins enabled (Auth settings)
//   - The initial schema migration applied (characters table + RLS)
//
// Exit code 0 = all assertions passed, 1 = something failed.
// Leaves one orphaned anonymous user behind (acceptable for a smoke test).
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

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

  console.log(`\nAuth + RLS smoke test → ${url}\n`);

  // 1. Anonymous sign-in (also proves anon sign-ins are enabled).
  console.log('Anonymous session');
  const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
  check('signInAnonymously() succeeds', !anonErr && !!anon?.user,
    anonErr ? anonErr.message : `uid ${anon.user.id.slice(0, 8)}…`);
  if (anonErr || !anon?.user) {
    console.log('\nCannot continue without a session (is anonymous sign-in enabled?).\n');
    process.exit(1);
  }
  const uid = anon.user.id;

  // 2. Profile row exists (trigger) or can be upserted (client safety net).
  console.log('\nProfile');
  let { data: profile } = await supabase.from('profiles').select('id').eq('id', uid).maybeSingle();
  if (!profile) {
    await supabase.from('profiles').upsert({ id: uid }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data: profile } = await supabase.from('profiles').select('id').eq('id', uid).maybeSingle());
  }
  check('profile row present for the anon user', !!profile);

  // 3. Insert a character owned by the current user → should succeed.
  console.log('\ncharacters RLS');
  const name = `Smoketest ${Date.now()}`;
  const { data: mine, error: mineErr } = await supabase
    .from('characters')
    .insert({ owner_id: uid, name, realm: 'Smoke', class: 'Warrior', race: 'Dwarf', level: 1 })
    .select()
    .single();
  check('insert own-owned character succeeds', !mineErr && !!mine, mineErr?.message);

  // 4. Insert a character owned by someone else → RLS with-check should block.
  const { error: spoofErr } = await supabase
    .from('characters')
    .insert({ owner_id: randomUUID(), name: `${name} spoof` })
    .select();
  check('insert with foreign owner_id is rejected', !!spoofErr, spoofErr?.message ?? 'no error returned');

  // 5. Read back own characters → should include the row we made.
  const { data: rows } = await supabase.from('characters').select('id').eq('id', mine?.id ?? '');
  check('can read own character', (rows?.length ?? 0) === 1);

  // 6. Cleanup the inserted row while still authed.
  if (mine?.id) {
    const { error: delErr } = await supabase.from('characters').delete().eq('id', mine.id);
    check('can delete own character (cleanup)', !delErr, delErr?.message);
  }

  // 7. Signed out → insert should fail (no auth.uid()).
  console.log('\nSigned out');
  await supabase.auth.signOut();
  const { error: outErr } = await supabase
    .from('characters')
    .insert({ owner_id: uid, name: `${name} after-signout` })
    .select();
  check('insert after sign-out is rejected', !!outErr, outErr?.message ?? 'no error returned');

  console.log(`\n${failed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nUnexpected error:', e);
  process.exit(1);
});
