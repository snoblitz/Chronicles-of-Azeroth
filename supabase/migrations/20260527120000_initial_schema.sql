-- Aftertale — initial schema
--
-- Multi-tier backend foundation (see docs/companion-architecture.md §9).
-- Pure foundation: no user-facing impact. Hybrid modeling — locked fields get
-- real columns, still-evolving shapes live in JSONB. Promote a column out of
-- JSONB the moment we start filtering or sorting on it.
--
-- Every table has RLS enabled. Ownership flows from auth.uid():
--   profiles.id = auth.uid()
--   characters.owner_id = auth.uid()
--   events / chapters / bible -> via characters FK chain
--   subscriptions / unlocks -> read-only from client; writes via service role
--   pair_codes -> anon read of unconsumed code; consumption must be auth'd

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — app-level user fields, keyed on auth.users.id
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  tier          text not null default 'free',  -- cached for UI; subscriptions is source of truth
  migrated_at   timestamptz,                    -- set when an anonymous session is claimed by this account
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- characters — locked identity fields as columns; full bible lives in `bible`
-- ---------------------------------------------------------------------------

create table public.characters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  realm       text,
  class       text,
  race        text,
  level       int,
  core_quote  text,                              -- "The Hero's Truth" in UI; data field stays core_quote
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A character slot is a unique <character>-<realm> pair per account (the license).
  unique (owner_id, name, realm)
);

create index characters_owner_id_idx on public.characters (owner_id);

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bible — full living character document (1:1 with character)
-- ---------------------------------------------------------------------------

create table public.bible (
  character_id  uuid primary key references public.characters (id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create trigger bible_set_updated_at
  before update on public.bible
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events — raw captured gameplay events (addon shape not fully locked)
-- ---------------------------------------------------------------------------

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  event_type   text not null,
  occurred_at  timestamptz,
  ingested_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb
);

create index events_character_id_idx on public.events (character_id);
create index events_character_occurred_idx on public.events (character_id, occurred_at);

-- ---------------------------------------------------------------------------
-- chapters — enriched narrative output (prose shape still evolving)
-- ---------------------------------------------------------------------------

create table public.chapters (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  sequence     int not null,
  title        text,
  status       text not null default 'draft',
  body         jsonb not null default '{}'::jsonb,  -- paragraphs + structure
  created_at   timestamptz not null default now(),
  unique (character_id, sequence)
);

create index chapters_character_id_idx on public.chapters (character_id);

-- ---------------------------------------------------------------------------
-- subscriptions — Stripe-backed; client read-only, writes via service role
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references public.profiles (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  tier                   text not null,           -- companion | chronicler | loremaster
  status                 text not null,           -- active | past_due | canceled | ...
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- unlocks — permanent à la carte purchases (Quill & Coin); client read-only
-- ---------------------------------------------------------------------------

create table public.unlocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  sku               text not null,                -- hero_slot | chapter_export | theme | regen | bible_polish | ...
  quantity          int not null default 1,
  source            text,                          -- e.g. 'stripe' | 'grant'
  stripe_session_id text,                          -- nullable: non-purchase grants have none
  granted_at        timestamptz not null default now(),
  consumed_at       timestamptz                    -- nullable: single-use unlocks set this on use
);

create index unlocks_user_id_idx on public.unlocks (user_id);

-- ---------------------------------------------------------------------------
-- companion_devices — paired desktop daemons
-- ---------------------------------------------------------------------------

create table public.companion_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    text not null,
  platform     text,                               -- win32 | darwin | linux
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, device_id)
);

create index companion_devices_user_id_idx on public.companion_devices (user_id);

-- ---------------------------------------------------------------------------
-- pair_codes — TV-login pairing (see companion-architecture.md §5)
-- Created device-side (service role), claimed by an authed user.
-- ---------------------------------------------------------------------------

create table public.pair_codes (
  code        text primary key,                   -- 6-digit, e.g. '493217'
  user_id     uuid references public.profiles (id) on delete cascade,  -- null until claimed
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.profiles          enable row level security;
alter table public.characters         enable row level security;
alter table public.bible              enable row level security;
alter table public.events             enable row level security;
alter table public.chapters           enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.unlocks            enable row level security;
alter table public.companion_devices  enable row level security;
alter table public.pair_codes         enable row level security;

-- profiles: owner can read + update own row. Insert handled by trigger;
-- allow self-insert too for resilience. No delete (cascade from auth.users).
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- characters: full CRUD for the owner.
create policy characters_all_own on public.characters
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- bible / events / chapters: ownership via the parent character.
create policy bible_all_via_character on public.bible
  for all using (
    exists (select 1 from public.characters c
            where c.id = bible.character_id and c.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.characters c
            where c.id = bible.character_id and c.owner_id = (select auth.uid()))
  );

create policy events_all_via_character on public.events
  for all using (
    exists (select 1 from public.characters c
            where c.id = events.character_id and c.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.characters c
            where c.id = events.character_id and c.owner_id = (select auth.uid()))
  );

create policy chapters_all_via_character on public.chapters
  for all using (
    exists (select 1 from public.characters c
            where c.id = chapters.character_id and c.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.characters c
            where c.id = chapters.character_id and c.owner_id = (select auth.uid()))
  );

-- subscriptions / unlocks: client may read its own rows only.
-- Writes happen exclusively via the service role (Stripe webhook edge fn),
-- which bypasses RLS — so no insert/update/delete policies here.
create policy subscriptions_select_own on public.subscriptions
  for select using (user_id = (select auth.uid()));

create policy unlocks_select_own on public.unlocks
  for select using (user_id = (select auth.uid()));

-- companion_devices: full CRUD for the owner.
create policy companion_devices_all_own on public.companion_devices
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- pair_codes:
--   read  — anyone (incl. anon companion poller) may see an unconsumed code,
--           so the daemon can poll status and detect when user_id gets set.
--   claim — an authed user binds an unconsumed code to their account.
-- Code creation is service-role only (the /pair/start edge fn).
create policy pair_codes_select_unconsumed on public.pair_codes
  for select using (consumed_at is null);
create policy pair_codes_claim on public.pair_codes
  for update
  using (consumed_at is null)
  with check (user_id = (select auth.uid()));
