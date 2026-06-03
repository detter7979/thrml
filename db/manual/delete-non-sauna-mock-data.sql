-- =============================================================================
-- Delete non-sauna mock listings, mock users, and related booking/message data.
-- KEEP ONLY: etter.dom@gmail.com (profile + auth user + admin access).
-- Also removes non-sauna listings (and their bookings/messages) owned by Dom.
--
-- Run in Supabase SQL Editor with service-role / postgres privileges.
-- ALWAYS run Section 1 (previews) first. Review counts. Then Section 2 once.
--
-- Does NOT delete objects in Storage (listing-images / avatars). Clean buckets
-- separately if needed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 1 — PREVIEW (safe to run repeatedly)
-- -----------------------------------------------------------------------------

with keeper as (
  select u.id, u.email
  from auth.users u
  where lower(trim(u.email)) = 'etter.dom@gmail.com'
  limit 1
),
users_to_delete as (
  select u.id, u.email
  from auth.users u
  where not exists (select 1 from keeper k where k.id = u.id)
),
listings_to_delete as (
  select l.id, l.title, l.service_type, l.host_id
  from public.listings l
  where l.host_id in (select id from users_to_delete)
     or (
       coalesce(l.is_deleted, false) = false
       and lower(coalesce(l.service_type, '')) <> 'sauna'
     )
),
bookings_to_delete as (
  select b.id, b.listing_id, b.host_id, b.guest_id, b.status
  from public.bookings b
  where b.listing_id in (select id from listings_to_delete)
     or b.host_id in (select id from users_to_delete)
     or b.guest_id in (select id from users_to_delete)
)
select 'keeper' as scope, (select email from keeper) as email, (select count(*) from keeper) as row_count
union all
select 'users_to_delete', null, (select count(*) from users_to_delete)
union all
select 'listings_to_delete', null, (select count(*) from listings_to_delete)
union all
select 'bookings_to_delete', null, (select count(*) from bookings_to_delete);

-- Listing detail preview
with keeper as (
  select id from auth.users where lower(trim(email)) = 'etter.dom@gmail.com' limit 1
),
users_to_delete as (
  select id from auth.users u where not exists (select 1 from keeper k where k.id = u.id)
)
select
  l.id,
  l.title,
  l.service_type,
  l.city,
  l.is_active,
  p.full_name as host_name,
  au.email as host_email
from public.listings l
left join public.profiles p on p.id = l.host_id
left join auth.users au on au.id = l.host_id
where l.host_id in (select id from users_to_delete)
   or (
     coalesce(l.is_deleted, false) = false
     and lower(coalesce(l.service_type, '')) <> 'sauna'
   )
order by l.service_type, l.title;

-- Users that will be removed from auth
with keeper as (
  select id from auth.users where lower(trim(email)) = 'etter.dom@gmail.com' limit 1
)
select u.id, u.email, u.created_at, p.full_name, p.stripe_account_id, p.is_admin
from auth.users u
left join public.profiles p on p.id = u.id
where not exists (select 1 from keeper k where k.id = u.id)
order by u.created_at;

-- -----------------------------------------------------------------------------
-- Section 2 — DESTRUCTIVE DELETE (wraps in a transaction)
-- Uncomment the block below after previews look correct.
-- -----------------------------------------------------------------------------

/*
begin;

do $$
declare
  v_keeper_id uuid;
  v_listings int;
  v_bookings int;
  v_users int;
begin
  select id into v_keeper_id
  from auth.users
  where lower(trim(email)) = 'etter.dom@gmail.com'
  limit 1;

  if v_keeper_id is null then
    raise exception 'Keeper user etter.dom@gmail.com not found in auth.users — aborting.';
  end if;

  create temp table _keeper (id uuid primary key) on commit drop;
  insert into _keeper (id) values (v_keeper_id);

  create temp table _users_to_delete (id uuid primary key) on commit drop;
  insert into _users_to_delete (id)
  select u.id
  from auth.users u
  where u.id <> v_keeper_id;

  create temp table _listings_to_delete (id uuid primary key) on commit drop;
  insert into _listings_to_delete (id)
  select l.id
  from public.listings l
  where l.host_id in (select id from _users_to_delete)
     or (
       coalesce(l.is_deleted, false) = false
       and lower(coalesce(l.service_type, '')) <> 'sauna'
     );

  create temp table _bookings_to_delete (id uuid primary key) on commit drop;
  insert into _bookings_to_delete (id)
  select b.id
  from public.bookings b
  where b.listing_id in (select id from _listings_to_delete)
     or b.host_id in (select id from _users_to_delete)
     or b.guest_id in (select id from _users_to_delete);

  select count(*) into v_listings from _listings_to_delete;
  select count(*) into v_bookings from _bookings_to_delete;
  select count(*) into v_users from _users_to_delete;

  raise notice 'Deleting % listings, % bookings, % auth users (keeper %).',
    v_listings, v_bookings, v_users, v_keeper_id;

  -- Booking-scoped rows (text booking_id columns)
  if to_regclass('public.support_requests') is not null then
    delete from public.support_requests sr
    where sr.booking_id in (select id::text from _bookings_to_delete);
  end if;

  if to_regclass('public.incident_reports') is not null then
    delete from public.incident_reports ir
    where ir.booking_id in (select id::text from _bookings_to_delete);
  end if;

  if to_regclass('public.dispute_decisions') is not null then
    delete from public.dispute_decisions dd
    where dd.booking_id in (select id::text from _bookings_to_delete)
       or dd.support_request_id in (
         select sr.id from public.support_requests sr
         where sr.booking_id in (select id::text from _bookings_to_delete)
       );
  end if;

  -- Financial / credits tied to bookings or mock users
  if to_regclass('public.financial_events') is not null then
    delete from public.financial_events
    where booking_id in (select id from _bookings_to_delete)
       or user_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.stripe_disputes') is not null then
    delete from public.stripe_disputes
    where booking_id in (select id from _bookings_to_delete);
  end if;

  if to_regclass('public.credit_ledger') is not null then
    delete from public.credit_ledger
    where booking_id in (select id from _bookings_to_delete)
       or user_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.user_credits') is not null then
    delete from public.user_credits
    where user_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.email_log') is not null then
    delete from public.email_log
    where user_id in (select id from _users_to_delete);
  end if;

  -- Reviews (legacy + new)
  if to_regclass('public.reviews') is not null then
    delete from public.reviews r
    where r.booking_id in (select id from _bookings_to_delete)
       or r.listing_id in (select id from _listings_to_delete);
  end if;

  if to_regclass('public.listing_reviews') is not null then
    delete from public.listing_reviews
    where booking_id in (select id from _bookings_to_delete)
       or listing_id in (select id from _listings_to_delete);
  end if;

  if to_regclass('public.guest_reviews') is not null then
    delete from public.guest_reviews
    where booking_id in (select id from _bookings_to_delete)
       or listing_id in (select id from _listings_to_delete)
       or host_id in (select id from _users_to_delete)
       or guest_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.guest_ratings') is not null then
    delete from public.guest_ratings
    where guest_id in (select id from _users_to_delete);
  end if;

  -- Slots / availability children of listings
  if to_regclass('public.booked_slots') is not null then
    delete from public.booked_slots
    where listing_id in (select id from _listings_to_delete)
       or guest_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.listing_blackout_dates') is not null then
    delete from public.listing_blackout_dates
    where listing_id in (select id from _listings_to_delete);
  end if;

  if to_regclass('public.availability') is not null then
    delete from public.availability
    where listing_id in (select id from _listings_to_delete);
  end if;

  if to_regclass('public.listing_photos') is not null then
    delete from public.listing_photos
    where listing_id in (select id from _listings_to_delete);
  end if;

  if to_regclass('public.listing_ratings') is not null then
    delete from public.listing_ratings
    where listing_id in (select id from _listings_to_delete);
  end if;

  -- Messaging (explicit before bookings if FKs are not cascading in your DB)
  if to_regclass('public.messages') is not null then
    delete from public.messages m
    where m.conversation_id in (
      select c.id from public.conversations c
      where c.booking_id in (select id from _bookings_to_delete)
    )
    or m.sender_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.conversations') is not null then
    delete from public.conversations c
    where c.booking_id in (select id from _bookings_to_delete)
       or c.host_id in (select id from _users_to_delete)
       or c.guest_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.message_templates') is not null then
    delete from public.message_templates
    where host_id in (select id from _users_to_delete);
  end if;

  -- Core booking + listing rows
  delete from public.bookings
  where id in (select id from _bookings_to_delete);

  delete from public.listings
  where id in (select id from _listings_to_delete);

  -- Remove mock auth users (profiles and most profile FKs cascade from auth.users)
  delete from auth.users
  where id in (select id from _users_to_delete);

  -- Ensure keeper remains admin / host-capable
  update public.profiles
  set
    is_admin = true,
    ui_intent = coalesce(nullif(ui_intent, ''), 'both')
  where id = v_keeper_id;

end $$;

commit;
*/

-- -----------------------------------------------------------------------------
-- Section 3 — POST-CHECK (run after Section 2)
-- -----------------------------------------------------------------------------

select id, email from auth.users order by created_at;

select
  count(*) filter (where lower(coalesce(service_type, '')) <> 'sauna') as non_sauna_listings,
  count(*) as total_active_listings
from public.listings
where coalesce(is_deleted, false) = false;

select service_type, count(*) as listings
from public.listings
where coalesce(is_deleted, false) = false
group by 1
order by 2 desc;

select count(*) as remaining_bookings from public.bookings;
select count(*) as remaining_messages from public.messages;
select count(*) as remaining_conversations from public.conversations;
