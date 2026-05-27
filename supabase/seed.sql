-- Aftertale — local dev seed
--
-- Runs after migrations on `supabase db reset`. LOCAL DEV ONLY — never run
-- against a real project. Creates one auth user + profile (via the
-- on_auth_user_created trigger) and a single character + bible so RLS
-- policies can be smoke-tested immediately.
--
-- Dev login (local Supabase only):
--   email:    dev@aftertale.test
--   password: aftertale-dev
--
-- Fixed IDs so tests can reference them:
--   user / profile : 11111111-1111-1111-1111-111111111111
--   character      : 22222222-2222-2222-2222-222222222222

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'dev@aftertale.test',
  crypt('aftertale-dev', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Dev Owner"}'::jsonb
)
on conflict (id) do nothing;

-- The on_auth_user_created trigger inserts the profile; make sure UI fields
-- are populated even if the trigger ran before this seed's metadata existed.
update public.profiles
   set display_name = 'Dev Owner', tier = 'free'
 where id = '11111111-1111-1111-1111-111111111111';

insert into public.characters (
  id, owner_id, name, realm, class, race, level, core_quote
)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Smoketest Stoneborn', 'Dev-Server', 'Warrior', 'Dwarf', 12,
  'The mountain does not flinch, and neither do I.'
)
on conflict (id) do nothing;

insert into public.bible (character_id, data)
values (
  '22222222-2222-2222-2222-222222222222',
  '{
    "faction": "Alliance",
    "homeland": "Dun Morogh",
    "voice": "Gruff, dry, economical with words.",
    "backstory": "A miner who took up the hammer when the troggs came up through the floor.",
    "beliefs": ["Stone remembers", "A debt is a debt"],
    "motivations": ["Reopen the family hold", "Outlive the grudge"],
    "fears": ["The dark below", "Being forgotten"],
    "flaws": ["Stubborn to a fault", "Slow to forgive"]
  }'::jsonb
)
on conflict (character_id) do nothing;
