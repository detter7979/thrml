-- Hosts' exact street addresses (location_address, and `location`, which holds the same text),
-- access/contact details and metre-accurate coordinates were readable by anyone via the anon key.
-- Marketplace norm: approximate area before booking, exact details only to the booked guest
-- (delivered server-side with the service role: confirmation email, booking page, reminders).

-- 1. Approximate public coordinates. Keep the exact point in private columns; snap lat/lng
--    to a ~1/250 degree grid (~450 m N-S, ~300 m E-W at Seattle's latitude).
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a where a.attrelid = 'public.listings'::regclass and a.attname = 'lat';
  execute format('alter table public.listings add column if not exists exact_lat %s', t);
  execute format('alter table public.listings add column if not exists exact_lng %s', t);
end $$;

create or replace function public.listings_approximate_coordinates()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Only treat lat/lng as a new exact point when they actually changed (re-saving the
  -- already-snapped value from an edit form must not overwrite the stored exact point).
  if tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    if new.lat is not null and new.lng is not null then
      new.exact_lat := new.lat;
      new.exact_lng := new.lng;
      new.lat := round(new.lat * 250) / 250.0;
      new.lng := round(new.lng * 250) / 250.0;
    end if;
  end if;
  return new;
end $$;

create trigger listings_approximate_coordinates
  before insert or update of lat, lng on public.listings
  for each row execute function public.listings_approximate_coordinates();

-- Backfill: existing rows still hold exact values in lat/lng.
update public.listings
set exact_lat = lat, exact_lng = lng,
    lat = round(lat * 250) / 250.0, lng = round(lng * 250) / 250.0
where lat is not null and lng is not null and exact_lat is null;

-- 2. Signed-out visitors (anon) can no longer read private columns. Column privileges only
--    take effect without a table-wide SELECT grant, so re-grant every other column.
revoke select on public.listings from anon;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'listings'
    and column_name not in (
      'location', 'location_address', 'exact_lat', 'exact_lng',
      'access_instructions', 'check_in_instructions', 'access_method', 'door_operation',
      'onsite_contact_name', 'onsite_contact_phone', 'emergency_contact'
    );
  execute format('grant select (%s) on public.listings to anon', cols);
end $$;

-- Note: signed-in users (authenticated) still hold table-wide SELECT; hosts' dashboard reads
-- their own rows with it. Closing that needs the private fields moved to a host/guest-scoped
-- table (follow-up).
