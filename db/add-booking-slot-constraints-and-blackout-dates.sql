-- Prevent overlapping slot reservations and add host blackout dates.
-- Safe to run multiple times.

create extension if not exists btree_gist;

alter table if exists public.booked_slots
add column if not exists status text not null default 'pending_payment',
add column if not exists guest_id uuid references public.profiles(id) on delete set null,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booked_slots_status_check'
  ) then
    alter table public.booked_slots
    add constraint booked_slots_status_check
    check (status in ('pending_payment', 'confirmed', 'cancelled', 'expired'));
  end if;
end $$;

create or replace function public.set_booked_slot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists booked_slots_set_updated_at on public.booked_slots;
create trigger booked_slots_set_updated_at
before update on public.booked_slots
for each row
execute function public.set_booked_slot_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'no_overlapping_slots'
  ) then
    alter table public.booked_slots
    add constraint no_overlapping_slots
    exclude using gist (
      listing_id with =,
      session_date with =,
      tsrange(session_date + start_time, session_date + end_time) with &&
    )
    where (status in ('pending_payment', 'confirmed'));
  end if;
end $$;

create index if not exists booked_slots_lookup_idx
  on public.booked_slots (listing_id, session_date, status, start_time, end_time);

create or replace function public.reserve_booked_slot_atomic(
  p_listing_id uuid,
  p_guest_id uuid,
  p_session_date date,
  p_start_time time,
  p_end_time time
)
returns table (
  success boolean,
  slot_id uuid,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  if p_end_time <= p_start_time then
    return query select false, null::uuid, 'invalid_time_range'::text, 'End time must be after start time'::text;
    return;
  end if;

  update public.booked_slots
  set status = 'expired', updated_at = now()
  where status = 'pending_payment'
    and created_at < now() - interval '15 minutes';

  -- Lock only rows for the same listing/date before overlap check + insert.
  perform 1
  from public.booked_slots
  where listing_id = p_listing_id
    and session_date = p_session_date
    and status in ('pending_payment', 'confirmed')
  for update;

  if exists (
    select 1
    from public.booked_slots s
    where s.listing_id = p_listing_id
      and s.session_date = p_session_date
      and s.status in ('pending_payment', 'confirmed')
      and s.start_time < p_end_time
      and s.end_time > p_start_time
  ) then
    return query select false, null::uuid, 'slot_conflict'::text, 'Time slot is already reserved'::text;
    return;
  end if;

  insert into public.booked_slots (
    listing_id,
    guest_id,
    session_date,
    start_time,
    end_time,
    status
  )
  values (
    p_listing_id,
    p_guest_id,
    p_session_date,
    p_start_time,
    p_end_time,
    'pending_payment'
  )
  returning id into v_slot_id;

  return query select true, v_slot_id, null::text, null::text;
exception
  when exclusion_violation then
    return query select false, null::uuid, 'slot_conflict'::text, 'Time slot is already reserved'::text;
  when others then
    return query select false, null::uuid, 'reserve_failed'::text, sqlerrm::text;
end;
$$;

grant execute on function public.reserve_booked_slot_atomic(uuid, uuid, date, time, time) to anon, authenticated, service_role;

create table if not exists public.listing_blackout_dates (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  blackout_date date not null,
  reason text,
  created_at timestamptz default now(),
  unique (listing_id, blackout_date)
);

alter table public.listing_blackout_dates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'listing_blackout_dates'
      and policyname = 'hosts manage own blackout dates'
  ) then
    create policy "hosts manage own blackout dates"
    on public.listing_blackout_dates
    for all
    using (
      listing_id in (
        select id from public.listings where host_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'listing_blackout_dates'
      and policyname = 'blackout dates are publicly readable'
  ) then
    create policy "blackout dates are publicly readable"
    on public.listing_blackout_dates
    for select
    using (
      listing_id in (
        select id from public.listings where is_active = true
      )
    );
  end if;
end $$;

create index if not exists listing_blackout_dates_listing_date_idx
  on public.listing_blackout_dates (listing_id, blackout_date);
