-- Native app push tokens (APNs today). One row per device token; a user can have several devices.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists push_devices_user_active_idx
  on public.push_devices (user_id)
  where disabled_at is null;

alter table public.push_devices enable row level security;

-- Users can see and remove their own devices; writes go through the API with the service role.
drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own" on public.push_devices
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own" on public.push_devices
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.push_devices from anon;
