-- Manual script: normalize Seattle / Puget Sound listing location fields for local SEO pages.
-- Run in Supabase SQL Editor (or psql) after reviewing the preview queries.
-- Adjust WHERE clauses to match your real data; do not blindly run updates in production.

-- ---------------------------------------------------------------------------
-- 1) Preview: active sauna-class listings with weak location text (common reason they miss /saunas/seattle)
-- ---------------------------------------------------------------------------
select
  id,
  title,
  service_type,
  city,
  location_city,
  state,
  location_state,
  lat,
  lng,
  left(coalesce(location, ''), 80) as location_preview,
  left(coalesce(location_address, ''), 80) as address_preview
from public.listings
where coalesce(is_deleted, false) = false
  and is_active = true
  and service_type in ('sauna', 'infrared', 'cold_plunge', 'float_tank')
order by created_at desc;

-- ---------------------------------------------------------------------------
-- 2) Preview: rows inside a rough Puget Sound bounding box (decimal degrees)
--    Broaden/tighten the box if needed.
-- ---------------------------------------------------------------------------
select
  id,
  title,
  service_type,
  city,
  location_city,
  state,
  location_state,
  lat,
  lng
from public.listings
where coalesce(is_deleted, false) = false
  and is_active = true
  and service_type = 'sauna'
  and lat is not null
  and lng is not null
  and lat between 47.05 and 48.55
  and lng between -123.35 and -121.05;

-- ---------------------------------------------------------------------------
-- 3) Fix by explicit IDs (safest): set canonical city/state for your six listings.
--    Replace the UUIDs with your real listing ids from the previews above.
-- ---------------------------------------------------------------------------
-- update public.listings
-- set
--   city = coalesce(nullif(trim(city), ''), 'Seattle'),
--   location_city = coalesce(nullif(trim(location_city), ''), city, 'Seattle'),
--   state = coalesce(nullif(trim(state), ''), 'WA'),
--   location_state = coalesce(nullif(trim(location_state), ''), state, 'WA'),
--   country = coalesce(nullif(trim(country), ''), 'US'),
--   updated_at = now()
-- where id in (
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   '00000000-0000-0000-0000-000000000002'::uuid
-- )
--   and coalesce(is_deleted, false) = false;

-- ---------------------------------------------------------------------------
-- 4) Optional bulk helper: for active listings in the Puget Sound box that still
--    lack city/location_city, set display city to Seattle (SEO slug target).
--    Skip or edit if you prefer suburb names from geocoding instead.
-- ---------------------------------------------------------------------------
-- update public.listings
-- set
--   city = coalesce(nullif(trim(city), ''), 'Seattle'),
--   location_city = coalesce(nullif(trim(location_city), ''), 'Seattle'),
--   state = coalesce(nullif(trim(state), ''), 'WA'),
--   location_state = coalesce(nullif(trim(location_state), ''), 'WA'),
--   updated_at = now()
-- where coalesce(is_deleted, false) = false
--   and is_active = true
--   and lat is not null
--   and lng is not null
--   and lat between 47.05 and 48.55
--   and lng between -123.35 and -121.05
--   and (
--     nullif(trim(city), '') is null
--     or nullif(trim(location_city), '') is null
--   );
