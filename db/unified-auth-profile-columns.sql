alter table public.profiles
  add column if not exists ui_intent text default 'guest'
    check (ui_intent in ('guest', 'host', 'both')),
  add column if not exists phone text,
  add column if not exists phone_verified boolean default false,
  add column if not exists profile_complete boolean default false;
