-- public_profiles and guest_reviews_public are SECURITY DEFINER views owned by postgres, and
-- anon/authenticated held INSERT/UPDATE/DELETE on them. Simple views are auto-updatable, so
-- anyone with the public anon key could rewrite or delete any profile (name, avatar, rating,
-- is_host, id_verified) or guest review, bypassing RLS on the base tables. Verified 2026-10-10
-- with a rolled-back UPDATE as anon.

-- public_profiles: cross-user reads of public columns are intended (profiles RLS is self-only),
-- so it stays a definer view, but read-only.
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- guest_reviews_public: not used by the app, and it exposed guest_id/booking_id/listing_id
-- (who stayed where) to anyone. Server code can still read it with the service role.
revoke all on public.guest_reviews_public from anon, authenticated;

comment on view public.public_profiles is
  'Public profile columns for cross-user reads. SECURITY DEFINER on purpose (profiles RLS is self-only); SELECT-only for anon/authenticated.';
