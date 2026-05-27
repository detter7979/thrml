-- Follow-ups: host review prompts + host-only comments on guest reviews

alter table public.bookings
  add column if not exists host_review_requested_at timestamptz;

-- Public view exposes ratings only (comments stay on base table for hosts)
create or replace view public.guest_reviews_public as
select
  id,
  booking_id,
  listing_id,
  host_id,
  guest_id,
  rating_overall,
  is_published,
  created_at
from public.guest_reviews
where coalesce(is_published, true) = true;

comment on view public.guest_reviews_public is 'Published guest ratings without host-only comments.';

-- Replace broad public row access with host-network access (includes comments)
drop policy if exists guest_reviews_public_select_published on public.guest_reviews;

drop policy if exists guest_reviews_host_network_select on public.guest_reviews;
create policy guest_reviews_host_network_select
on public.guest_reviews
for select
to authenticated
using (
  coalesce(is_published, true) = true
  and exists (
    select 1
    from public.listings l
    where l.host_id = auth.uid()
  )
);

-- Guests should not read host comments about them on the base table
drop policy if exists guest_reviews_guest_select_own on public.guest_reviews;

grant select on public.guest_reviews_public to anon, authenticated;
