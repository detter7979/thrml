create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists platform_settings_key_idx on public.platform_settings (key);

insert into public.platform_settings (key, value)
values
  ('platform_fee_percent', '12'::jsonb),
  ('instant_book_enabled', 'true'::jsonb),
  ('new_host_signups_enabled', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb)
on conflict (key) do nothing;
