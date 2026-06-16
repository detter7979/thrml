-- ALREADY APPLIED REMOTELY (version 20260615224120). Mirror file for local
-- history parity -- will NOT re-run on push.
--
-- Item 1 (final state): public_profiles and guest_reviews_public expose only
-- curated public-safe columns over locked-down base tables, so a definer view
-- is the correct public-read interface. (A brief security_invoker=on flip was
-- reverted here because it broke anonymous reads -- profiles/guest_reviews have
-- no public-read policy by design.) Verified: anon sees all 3 profiles again.

alter view public.public_profiles      set (security_invoker = off);
alter view public.guest_reviews_public  set (security_invoker = off);

grant select on public.public_profiles      to anon, authenticated;
grant select on public.guest_reviews_public to anon, authenticated;
