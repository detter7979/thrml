-- Signed-in users could update ANY column on their own profile row through the public API
-- (RLS only checks id = auth.uid()), including is_admin, is_banned, id_verified,
-- referral_credit_cents, ratings and Stripe payout flags. Lock INSERT/UPDATE to the columns
-- users legitimately edit themselves; everything else is written server-side with the
-- service role (admin client), which is unaffected by these grants.
--
-- New profile columns that users should edit directly must be granted explicitly below.

revoke insert, update on table public.profiles from anon, authenticated;

grant insert (
  id, full_name, first_name, last_name, avatar_url, phone, bio, tagline, languages, house_rules,
  newsletter_opted_in, newsletter_opted_in_at, notification_preferences,
  terms_accepted, terms_accepted_at, terms_version,
  marketing_consent, marketing_consent_at, deletion_requested_at
) on public.profiles to authenticated;

grant update (
  id, full_name, first_name, last_name, avatar_url, phone, bio, tagline, languages, house_rules,
  newsletter_opted_in, newsletter_opted_in_at, notification_preferences,
  terms_accepted, terms_accepted_at, terms_version,
  marketing_consent, marketing_consent_at, deletion_requested_at
) on public.profiles to authenticated;

-- Hosts with listings should carry the host flag (created before promoteProfileToHost existed).
update public.profiles p
set is_host = true
where coalesce(p.is_host, false) = false
  and exists (select 1 from public.listings l where l.host_id = p.id);
