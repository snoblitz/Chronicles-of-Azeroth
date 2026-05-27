#!/usr/bin/env node
// ============================================================================
// supabase-push-email-templates.mjs
//
// Pushes the on-brand Aftertale email templates + subject lines to the Supabase
// Auth config via the Management API. Idempotent — safe to re-run after any
// edit to supabase/email-templates/*.html.
//
// Usage:
//   $env:SUPABASE_ACCESS_TOKEN="sbp_…"
//   $env:SUPABASE_PROJECT_REF="zukzghfbldvzbigqdirx"
//   node tools/supabase-push-email-templates.mjs
//
// Reads the resulting config back to verify the update landed and prints a
// short summary.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in env.');
  process.exit(1);
}

// Map: Aftertale template name → { Supabase config key (subject), Supabase
// config key (body content), subject line, file path }
const TEMPLATES = [
  {
    name: 'save-chronicle (email_change)',
    subjectKey: 'mailer_subjects_email_change',
    contentKey: 'mailer_templates_email_change_content',
    subject: 'Save your chronicle on Aftertale',
    file: 'supabase/email-templates/save-chronicle.html',
  },
  {
    name: 'sign-in (magic_link)',
    subjectKey: 'mailer_subjects_magic_link',
    contentKey: 'mailer_templates_magic_link_content',
    subject: 'Open your chronicle',
    file: 'supabase/email-templates/sign-in.html',
  },
];

async function loadAll() {
  const out = {};
  for (const t of TEMPLATES) {
    const html = await readFile(resolve(ROOT, t.file), 'utf8');
    out[t.subjectKey] = t.subject;
    out[t.contentKey] = html;
  }
  return out;
}

async function patchAuth(body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function getAuth() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET failed (${res.status})`);
  return res.json();
}

async function main() {
  console.log(`→ Loading templates from ${ROOT}/supabase/email-templates/`);
  const body = await loadAll();

  console.log(`→ PATCH https://api.supabase.com/v1/projects/${REF}/config/auth`);
  await patchAuth(body);

  console.log(`→ Verifying …`);
  const after = await getAuth();
  let ok = true;
  for (const t of TEMPLATES) {
    const subjectMatch = after[t.subjectKey] === t.subject;
    const contentMatch = after[t.contentKey]?.includes('Aftertale');
    console.log(`  ${subjectMatch && contentMatch ? '✓' : '✗'} ${t.name}`);
    console.log(`      subject: "${after[t.subjectKey]}"`);
    if (!(subjectMatch && contentMatch)) ok = false;
  }

  if (!ok) {
    console.error('\n✗ Verification failed — at least one template did not round-trip cleanly.');
    process.exit(1);
  }
  console.log('\n✓ All email templates shipped.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
