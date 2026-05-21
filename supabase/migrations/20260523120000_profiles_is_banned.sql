alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz;

comment on column public.profiles.is_banned is 'When true, user cannot sign in or use protected routes.';
comment on column public.profiles.banned_at is 'Timestamp when the account was last banned (null if currently unbanned).';
