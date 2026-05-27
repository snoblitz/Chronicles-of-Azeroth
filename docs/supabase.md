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

## Auth + RLS smoke test

`npm run auth:smoke` (`tools/auth-smoke.mjs`) signs in anonymously, then asserts
the `characters` RLS policy: own-owned insert succeeds, foreign `owner_id` is
rejected, own rows are readable, and inserts after sign-out are denied. Reads
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env or `.env.local`.

Project prereqs for auth to work:
- **Anonymous sign-ins enabled** (Auth settings) — else `signInAnonymously()` fails.
- **Redirect URLs allowlisted** (Auth → URL Configuration):
  `http://localhost:5180/auth/callback` and `https://aftertale.gg/auth/callback`.
