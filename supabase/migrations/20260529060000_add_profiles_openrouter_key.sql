-- Opt-in BYOK key sync.
--
-- The OpenRouter key is the user's own spendable credential; by default it
-- never leaves the browser (companion-architecture.md §6). This column holds it
-- ONLY when the user explicitly ticks "sync this key to my devices" in
-- Settings → API Keys, so the key follows them to a new machine instead of
-- forcing a re-paste.
--
-- Security posture: nullable, populated only on opt-in. profiles already has
-- RLS restricting select/update to the owner (auth.uid() = id), so no row but
-- the user's own is readable. It is stored plaintext (BYOK is used client-side,
-- so there's no usable server-side encryption path under OTP auth). Blast
-- radius if the DB is breached is financial-only and instantly revocable at
-- openrouter.ai — surfaced to the user in the opt-in copy.

alter table public.profiles add column if not exists openrouter_key text;
