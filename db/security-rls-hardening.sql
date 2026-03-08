-- Security hardening migration for Supabase RLS policies.
-- This migration uses conditional table checks because this repo contains additive SQL files
-- and may be applied across environments with slightly different schema histories.

do $$
begin
  if to_regclass('public.listings') is not null then
    execute 'alter table public.listings enable row level security';
    execute 'drop policy if exists listings_public_select_active on public.listings';
    execute 'create policy listings_public_select_active on public.listings for select to anon, authenticated using (is_active = true)';

    execute 'drop policy if exists listings_host_insert_own on public.listings';
    execute 'create policy listings_host_insert_own on public.listings for insert to authenticated with check (host_id = auth.uid() and coalesce(is_featured, false) = false)';

    execute 'drop policy if exists listings_host_update_own on public.listings';
    execute '' ||
      'create policy listings_host_update_own on public.listings for update to authenticated ' ||
      'using (host_id = auth.uid()) ' ||
      'with check (host_id = auth.uid() and is_featured = (select l.is_featured from public.listings l where l.id = listings.id))';

    execute 'drop policy if exists listings_host_delete_own on public.listings';
    execute 'create policy listings_host_delete_own on public.listings for delete to authenticated using (host_id = auth.uid())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.bookings') is not null then
    execute 'alter table public.bookings enable row level security';
    execute 'drop policy if exists bookings_guest_select_own on public.bookings';
    execute 'create policy bookings_guest_select_own on public.bookings for select to authenticated using (guest_id = auth.uid())';

    execute 'drop policy if exists bookings_host_select_own_listing on public.bookings';
    execute '' ||
      'create policy bookings_host_select_own_listing on public.bookings for select to authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = bookings.listing_id and l.host_id = auth.uid()))';

    execute 'drop policy if exists bookings_guest_insert_self on public.bookings';
    execute '' ||
      'create policy bookings_guest_insert_self on public.bookings for insert to authenticated ' ||
      'with check (guest_id = auth.uid() and status = ''pending'')';
    -- No update/delete policy for authenticated users: booking status and financial fields
    -- should be mutated via server-side APIs and Stripe webhook only.
  end if;
end $$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists profiles_self_select on public.profiles';
    execute 'create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid() or user_id = auth.uid())';
    execute 'drop policy if exists profiles_self_insert on public.profiles';
    execute 'create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = auth.uid() or user_id = auth.uid())';
    execute 'drop policy if exists profiles_self_update on public.profiles';
    execute 'create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid() or user_id = auth.uid()) with check (id = auth.uid() or user_id = auth.uid())';

    execute 'create or replace view public.public_profiles as
      select
        id,
        user_id,
        full_name,
        avatar_url,
        bio,
        tagline,
        host_since,
        average_rating,
        total_reviews
      from public.profiles';
    execute 'grant select on public.public_profiles to anon, authenticated';
  end if;
end $$;

do $$
begin
  if to_regclass('public.reviews') is not null then
    execute 'alter table public.reviews enable row level security';
    execute 'drop policy if exists reviews_public_select_published on public.reviews';
    execute 'create policy reviews_public_select_published on public.reviews for select to anon, authenticated using (is_published = true)';
    execute 'drop policy if exists reviews_insert_completed_booking_user on public.reviews';
    execute '' ||
      'create policy reviews_insert_completed_booking_user on public.reviews for insert to authenticated ' ||
      'with check (reviewer_id = auth.uid() and coalesce(is_published, true) = true and coalesce(flagged, false) = false and host_response is null and host_responded_at is null and exists (select 1 from public.bookings b where b.id = reviews.booking_id and b.guest_id = auth.uid() and b.status = ''completed''))';
  end if;
end $$;

do $$
begin
  if to_regclass('public.listing_reviews') is not null then
    execute 'alter table public.listing_reviews enable row level security';
    execute 'drop policy if exists listing_reviews_public_select_published on public.listing_reviews';
    execute 'create policy listing_reviews_public_select_published on public.listing_reviews for select to anon, authenticated using (coalesce(is_published, true) = true)';
    execute 'drop policy if exists listing_reviews_insert_completed_booking_user on public.listing_reviews';
    execute '' ||
      'create policy listing_reviews_insert_completed_booking_user on public.listing_reviews for insert to authenticated ' ||
      'with check (guest_id = auth.uid() and exists (select 1 from public.bookings b where b.id = listing_reviews.booking_id and b.guest_id = auth.uid() and b.status = ''completed''))';
    -- No update/delete policy for guests.
  end if;
end $$;

do $$
begin
  if to_regclass('public.conversations') is not null then
    execute 'alter table public.conversations enable row level security';
    execute 'drop policy if exists conversations_participant_select on public.conversations';
    execute 'create policy conversations_participant_select on public.conversations for select to authenticated using (guest_id = auth.uid() or host_id = auth.uid())';
    execute 'drop policy if exists conversations_participant_insert on public.conversations';
    execute 'create policy conversations_participant_insert on public.conversations for insert to authenticated with check (guest_id = auth.uid() or host_id = auth.uid())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.messages') is not null then
    execute 'alter table public.messages enable row level security';
    execute 'drop policy if exists messages_participant_select on public.messages';
    execute '' ||
      'create policy messages_participant_select on public.messages for select to authenticated ' ||
      'using (exists (select 1 from public.conversations c where c.id = messages.conversation_id and (c.guest_id = auth.uid() or c.host_id = auth.uid())))';

    execute 'drop policy if exists messages_participant_insert_sender_self on public.messages';
    execute '' ||
      'create policy messages_participant_insert_sender_self on public.messages for insert to authenticated ' ||
      'with check (sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = messages.conversation_id and (c.guest_id = auth.uid() or c.host_id = auth.uid())))';
    -- No update/delete policy for authenticated users.
  end if;
end $$;

do $$
begin
  if to_regclass('public.availability') is not null then
    execute 'alter table public.availability enable row level security';
    execute 'drop policy if exists availability_public_select_active_listing on public.availability';
    execute '' ||
      'create policy availability_public_select_active_listing on public.availability for select to anon, authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = availability.listing_id and l.is_active = true))';
    execute 'drop policy if exists availability_host_crud_own on public.availability';
    execute '' ||
      'create policy availability_host_crud_own on public.availability for all to authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = availability.listing_id and l.host_id = auth.uid())) ' ||
      'with check (exists (select 1 from public.listings l where l.id = availability.listing_id and l.host_id = auth.uid()))';
  end if;
end $$;

do $$
begin
  if to_regclass('public.listing_photos') is not null then
    execute 'alter table public.listing_photos enable row level security';
    execute 'drop policy if exists listing_photos_public_select_active_listing on public.listing_photos';
    execute '' ||
      'create policy listing_photos_public_select_active_listing on public.listing_photos for select to anon, authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and l.is_active = true))';
    execute 'drop policy if exists listing_photos_host_crud_own on public.listing_photos';
    execute '' ||
      'create policy listing_photos_host_crud_own on public.listing_photos for all to authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and l.host_id = auth.uid())) ' ||
      'with check (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and l.host_id = auth.uid()))';
  end if;
end $$;

do $$
begin
  if to_regclass('public.listing_blackout_dates') is not null then
    execute 'alter table public.listing_blackout_dates enable row level security';
    execute 'drop policy if exists listing_blackout_dates_public_select_active_listing on public.listing_blackout_dates';
    execute '' ||
      'create policy listing_blackout_dates_public_select_active_listing on public.listing_blackout_dates for select to anon, authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = listing_blackout_dates.listing_id and l.is_active = true))';
    execute 'drop policy if exists listing_blackout_dates_host_crud_own on public.listing_blackout_dates';
    execute '' ||
      'create policy listing_blackout_dates_host_crud_own on public.listing_blackout_dates for all to authenticated ' ||
      'using (exists (select 1 from public.listings l where l.id = listing_blackout_dates.listing_id and l.host_id = auth.uid())) ' ||
      'with check (exists (select 1 from public.listings l where l.id = listing_blackout_dates.listing_id and l.host_id = auth.uid()))';
  end if;
end $$;

do $$
begin
  if to_regclass('public.waiver_templates') is not null then
    execute 'alter table public.waiver_templates enable row level security';
    execute 'drop policy if exists waiver_templates_public_active on public.waiver_templates';
    execute 'create policy waiver_templates_public_active on public.waiver_templates for select to anon, authenticated using (is_active = true)';
    -- No write policies: service role only.
  end if;
end $$;

do $$
begin
  if to_regclass('public.support_requests') is not null then
    execute 'alter table public.support_requests enable row level security';
    execute 'drop policy if exists support_requests_public_insert_only on public.support_requests';
    execute '' ||
      'create policy support_requests_public_insert_only on public.support_requests for insert to anon, authenticated ' ||
      'with check (coalesce(status, ''open'') = ''open'')';
    -- No read/update/delete policy for client roles.
  end if;
end $$;

do $$
begin
  if to_regclass('public.booked_slots') is not null then
    execute 'alter table public.booked_slots enable row level security';
    execute 'drop policy if exists booked_slots_host_guest_select_only on public.booked_slots';
    execute '' ||
      'create policy booked_slots_host_guest_select_only on public.booked_slots for select to authenticated ' ||
      'using (guest_id = auth.uid() or exists (select 1 from public.listings l where l.id = booked_slots.listing_id and l.host_id = auth.uid()))';
    -- No insert/delete policy for client roles.
  end if;
end $$;
