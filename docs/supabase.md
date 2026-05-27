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
