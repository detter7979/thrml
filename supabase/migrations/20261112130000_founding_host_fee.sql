-- Founding hosts: the first N hosts who publish before guest launch pay a reduced host fee
-- for a window that starts at their first paid booking (so the clock doesn't run down
-- before guests can book).

alter table public.profiles
  add column if not exists founding_host boolean not null default false,
  add column if not exists founding_host_since timestamptz,
  add column if not exists founding_fee_expires_at timestamptz;

comment on column public.profiles.founding_host is
  'Founding host: reduced host fee (platform_settings.founding_host_fee_percent).';
comment on column public.profiles.founding_fee_expires_at is
  'Set at the first paid booking to now() + founding_fee_window_days. Null = window not started yet.';

insert into public.platform_settings (key, value) values
  ('founding_host_fee_percent', '10'::jsonb),
  ('founding_host_cap', '25'::jsonb),
  ('founding_fee_window_days', '90'::jsonb)
on conflict (key) do nothing;

-- Claim a founding spot if any are left. Serialized so two hosts can't take the last spot.
create or replace function public.claim_founding_host(p_host uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already boolean;
  v_cap integer;
  v_taken integer;
begin
  select founding_host into v_already from public.profiles where id = p_host;
  if v_already is null then
    return false;
  end if;
  if v_already then
    return true;
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_founding_host'));

  select coalesce((value #>> '{}')::integer, 25) into v_cap
    from public.platform_settings where key = 'founding_host_cap';
  select count(*) into v_taken from public.profiles where founding_host;

  if v_taken >= coalesce(v_cap, 25) then
    return false;
  end if;

  update public.profiles
     set founding_host = true,
         founding_host_since = now()
   where id = p_host;
  return true;
end;
$$;

revoke all on function public.claim_founding_host(uuid) from public, anon, authenticated;
grant execute on function public.claim_founding_host(uuid) to service_role;

-- Start the founding-fee window at the host's first paid booking (idempotent).
create or replace function public.start_founding_fee_window(p_host uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_expires timestamptz;
begin
  select coalesce((value #>> '{}')::integer, 90) into v_days
    from public.platform_settings where key = 'founding_fee_window_days';

  update public.profiles
     set founding_fee_expires_at = now() + make_interval(days => coalesce(v_days, 90))
   where id = p_host
     and founding_host
     and founding_fee_expires_at is null
  returning founding_fee_expires_at into v_expires;

  return v_expires;
end;
$$;

revoke all on function public.start_founding_fee_window(uuid) from public, anon, authenticated;
grant execute on function public.start_founding_fee_window(uuid) to service_role;
