-- Public host/guest display profile view. Sensitive columns (phone, stripe_*, email, is_admin, etc.)
-- remain on profiles and are restricted to self-access via RLS.

create or replace view public.public_profiles as
select
  id,
  full_name,
  first_name,
  avatar_url,
  bio,
  tagline,
  languages,
  house_rules,
  average_rating,
  total_reviews,
  response_rate,
  response_time_hours,
  host_since,
  is_host,
  id_verified
from public.profiles;

grant select on public.public_profiles to anon, authenticated;
