-- Enforce 30-minute minimum booking blocks and add service duration display columns.
-- Safe to run multiple times.

alter table if exists public.listings
add column if not exists service_duration_min integer,
add column if not exists service_duration_max integer,
add column if not exists service_duration_unit text default 'minutes';

alter table if exists public.service_types
alter column min_duration_minutes set default 30,
alter column duration_increment_minutes set default 30;

update public.service_types
set min_duration_minutes = 30
where min_duration_minutes < 30;

update public.service_types
set duration_increment_minutes = 30
where duration_increment_minutes < 30;

update public.listings
set min_duration_override_minutes = 30
where min_duration_override_minutes < 30
  and min_duration_override_minutes is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'fixed_session_minutes'
  ) then
    update public.listings
    set fixed_session_minutes = 30
    where fixed_session_minutes < 30
      and fixed_session_minutes is not null;
  end if;
end $$;

comment on column listings.min_duration_override_minutes is
'Booking block size - controls time slot generation increments. Min 30 min.';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'fixed_session_minutes'
  ) then
    execute $sql$
      comment on column listings.fixed_session_minutes is
      'Booking block size for fixed_session listings. Controls slot increments.';
    $sql$;
  end if;
end $$;

comment on column listings.service_duration_min is
'Display only - informational service duration shown to guests on listing page.';

comment on column listings.service_duration_max is
'Display only - informational service duration shown to guests on listing page.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_min_duration_override_minutes_floor_30'
  ) then
    alter table public.listings
      add constraint listings_min_duration_override_minutes_floor_30
      check (min_duration_override_minutes is null or min_duration_override_minutes >= 30);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'fixed_session_minutes'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'listings_fixed_session_minutes_floor_30'
  ) then
    alter table public.listings
      add constraint listings_fixed_session_minutes_floor_30
      check (fixed_session_minutes is null or fixed_session_minutes >= 30);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_types_min_duration_minutes_floor_30'
  ) then
    alter table public.service_types
      add constraint service_types_min_duration_minutes_floor_30
      check (min_duration_minutes is null or min_duration_minutes >= 30);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_types_duration_increment_minutes_floor_30'
  ) then
    alter table public.service_types
      add constraint service_types_duration_increment_minutes_floor_30
      check (duration_increment_minutes is null or duration_increment_minutes >= 30);
  end if;
end $$;

-- Cold plunge listings (10-15 min service)
update public.listings
set service_duration_min = 10, service_duration_max = 15, service_duration_unit = 'minutes'
where service_type = 'cold_plunge'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Float tank listings (60-90 min service)
update public.listings
set service_duration_min = 60, service_duration_max = 90, service_duration_unit = 'minutes'
where service_type = 'float_tank'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Sauna listings (60-180 min service)
update public.listings
set service_duration_min = 60, service_duration_max = 180, service_duration_unit = 'minutes'
where service_type = 'sauna'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Contrast therapy listings (60-120 min service)
update public.listings
set service_duration_min = 60, service_duration_max = 120, service_duration_unit = 'minutes'
where service_type = 'contrast_therapy'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Infrared light listings (20-40 min service)
update public.listings
set service_duration_min = 20, service_duration_max = 40, service_duration_unit = 'minutes'
where service_type = 'infrared_light'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Cryotherapy listings (3 min service)
update public.listings
set service_duration_min = 3, service_duration_max = 3, service_duration_unit = 'minutes'
where service_type = 'cryotherapy'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- PEMF listings (30-60 min service)
update public.listings
set service_duration_min = 30, service_duration_max = 60, service_duration_unit = 'minutes'
where service_type = 'pemf'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Hyperbaric listings (60 min service)
update public.listings
set service_duration_min = 60, service_duration_max = 60, service_duration_unit = 'minutes'
where service_type = 'hyperbaric'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );

-- Halotherapy listings (45 min service)
update public.listings
set service_duration_min = 45, service_duration_max = 45, service_duration_unit = 'minutes'
where service_type = 'halotherapy'
  and host_id in (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'aaaaaaaa-0002-0002-0002-000000000002',
    'aaaaaaaa-0003-0003-0003-000000000003',
    'aaaaaaaa-0004-0004-0004-000000000004',
    'aaaaaaaa-0005-0005-0005-000000000005'
  );
