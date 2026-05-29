# Supabase

Backend foundation for the paid tiers (see
[`companion-architecture.md`](./companion-architecture.md) §9). Free/anonymous
tier stays localStorage-first; nothing in the app wires to Supabase yet.

## Local setup

```bash
npm i -g supabase            # or: scoop install supabase
supabase start               # boots local Postgres + Auth + Studio (Docker)
supabase db reset            # applies migrations/ then runs seed.sql
```

`supabase start` prints the local API URL + anon key — drop them into
`.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Migrations

Migrations live in `supabase/migrations/` (`YYYYMMDDHHMMSS_*.sql`).

```bash
supabase migration new <name>   # scaffold a new timestamped file
supabase db reset               # rebuild local DB from scratch + seed
supabase db push                # apply pending migrations to the linked project
```

`supabase/seed.sql` is **local dev only** — it inserts a dev user
(`dev@aftertale.test` / `aftertale-dev`) plus one character + bible so RLS
policies can be smoke-tested right after `db reset`.

## Regenerating types

After any schema change, regenerate the typed client definitions:

```bash
supabase gen types typescript --local > src/types/supabase.ts
# against the hosted project instead:
supabase gen types typescript --project-id <ref> > src/types/supabase.ts
```

`src/lib/supabase.ts` consumes that `Database` type. `getSupabase()` returns
`null` when env is unset, so the current public build is unaffected.

## Auth + RLS smoke tests

`npm run auth:smoke` (`tools/auth-smoke.mjs`) signs in anonymously, then asserts
the `characters` RLS policy: own-owned insert succeeds, foreign `owner_id` is
rejected, own rows are readable, and inserts after sign-out are denied.

`npm run sync:smoke` (`tools/cloud-sync-smoke.mjs`) exercises the cloud-sync
data layer end to end (13 checks): character insert, the per-character bible
bundle upsert into `bible.data`, the engine's nested `characters.select('id, bible(data)')`
read shape, last-writer-wins in-place replace, and cascade delete.

Both read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env or `.env.local`.

## Auth flow — anonymous-by-default + OTP code upgrade

The app is anonymous-first (`signInAnonymously()` on load; that user.id is the
stable `owner_id`). Accounts use **6-digit emailed OTP codes**, NOT magic-link
redirects — a code works in any browser/device, so reading email on a phone and
using the app on a laptop is fine (no PKCE same-browser jail).

- **Save your chronicle** (upgrade): `updateUser({ email })` → user enters the
  emailed code → `verifyOtp({ type: 'email_change' })`. The anonymous user.id is
  preserved, so cloud sync keeps the device's heroes (upgrade path).
- **Sign in** (returning): `signInWithOtp({ email, shouldCreateUser:false })` →
  `verifyOtp({ type: 'email' })`.
- See `src/lib/auth.ts` (`saveChronicle`, `signIn`, `verifyCode`) and
  `src/components/SaveChronicleModal.tsx` (two-step email → code UI).

Project prereqs for auth to work:
- **Anonymous sign-ins enabled** (Auth settings) — else `signInAnonymously()` fails.
- **Email templates emit the code, not (just) a link.** Edit BOTH the **Magic Link**
  and **Change Email Address** templates (Auth → Email Templates) to include
  `{{ .Token }}`. Recommended: drop `{{ .ConfirmationURL }}` entirely so email
  security scanners can't prefetch/consume the token before the user types the code.
- **OTP expiry** (Auth → Providers → Email): keep short (≈10 min).
- Redirect URL allow-listing is **no longer required** for the primary flow (codes
  don't redirect). The legacy `/auth/callback` route is kept only as a dead fallback.

