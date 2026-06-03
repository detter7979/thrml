-- =============================================================================
-- WIPE all listings, bookings, messages, and users EXCEPT etter.dom@gmail.com
--
-- Removes mock sauna listings (e5f6a7b8…, Priya/Derek/James hosts, etc.) and
-- everything else. Dom keeps auth + profile only (no listings/bookings left).
--
-- Does NOT touch support_requests — run delete-mock-support-requests.sql after.
-- Does NOT touch Storage buckets.
--
-- Run in Supabase SQL Editor (postgres / service role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREVIEW — run this first
-- -----------------------------------------------------------------------------

with keeper as (
  select id, email from auth.users
  where lower(trim(email)) = 'etter.dom@gmail.com'
  limit 1
)
select 'keeper' as item, (select email from keeper) as detail, (select count(*) from keeper) as n
union all select 'auth_users_to_delete', null, (select count(*) from auth.users u where not exists (select 1 from keeper k where k.id = u.id))
union all select 'listings', null, (select count(*) from public.listings)
union all select 'bookings', null, (select count(*) from public.bookings)
union all select 'conversations', null, (select count(*) from public.conversations)
union all select 'messages', null, (select count(*) from public.messages);

select u.id, u.email, p.full_name, p.is_admin,
  (select count(*) from public.listings l where l.host_id = u.id) as listings,
  (select count(*) from public.bookings b where b.host_id = u.id or b.guest_id = u.id) as bookings
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

select l.id, l.title, l.service_type, l.city, l.is_active, p.full_name as host
from public.listings l
left join public.profiles p on p.id = l.host_id
order by l.created_at desc;

-- -----------------------------------------------------------------------------
-- 2) DELETE — run after preview looks right (entire block below)
-- -----------------------------------------------------------------------------

begin;

do $$
declare
  v_keeper_id uuid;
begin
  select id into v_keeper_id
  from auth.users
  where lower(trim(email)) = 'etter.dom@gmail.com'
  limit 1;

  if v_keeper_id is null then
    raise exception 'etter.dom@gmail.com not found in auth.users — aborting.';
  end if;

  create temp table _keeper (id uuid primary key) on commit drop;
  insert into _keeper values (v_keeper_id);

  create temp table _users_to_delete (id uuid primary key) on commit drop;
  insert into _users_to_delete
  select id from auth.users where id <> v_keeper_id;

  raise notice 'Keeper %; deleting % other users, ALL listings/bookings/messages.',
    v_keeper_id, (select count(*) from _users_to_delete);

  -- Ledger / reviews (all rows — full reset)
  if to_regclass('public.financial_events') is not null then
    delete from public.financial_events;
  end if;

  if to_regclass('public.stripe_disputes') is not null then
    delete from public.stripe_disputes;
  end if;

  if to_regclass('public.credit_ledger') is not null then
    delete from public.credit_ledger;
  end if;

  if to_regclass('public.user_credits') is not null then
    delete from public.user_credits
    where user_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.email_log') is not null then
    delete from public.email_log
    where user_id in (select id from _users_to_delete);
  end if;

  if to_regclass('public.reviews') is not null then
    delete from public.reviews;
  end if;

  if to_regclass('public.listing_reviews') is not null then
    delete from public.listing_reviews;
  end if;

  if to_regclass('public.guest_reviews') is not null then
    delete from public.guest_reviews;
  end if;

  if to_regclass('public.guest_ratings') is not null then
    delete from public.guest_ratings;
  end if;

  if to_regclass('public.booked_slots') is not null then
    delete from public.booked_slots;
  end if;

  if to_regclass('public.listing_blackout_dates') is not null then
    delete from public.listing_blackout_dates;
  end if;

  if to_regclass('public.availability') is not null then
    delete from public.availability;
  end if;

  if to_regclass('public.listing_photos') is not null then
    delete from public.listing_photos;
  end if;

  if to_regclass('public.listing_ratings') is not null then
    delete from public.listing_ratings;
  end if;

  -- Messaging (all threads, including Dom’s test messages)
  if to_regclass('public.messages') is not null then
    delete from public.messages;
  end if;

  if to_regclass('public.conversations') is not null then
    delete from public.conversations;
  end if;

  if to_regclass('public.message_templates') is not null then
    delete from public.message_templates;
  end if;

  -- Core marketplace rows
  delete from public.bookings;
  delete from public.listings;

  -- Mock / QA auth users (Cane's Canines, Priya Nair, dddd… hosts, etc.)
  delete from auth.users
  where id in (select id from _users_to_delete);

  update public.profiles
  set
    is_admin = true,
    is_banned = false,
    ui_intent = 'both'
  where id = v_keeper_id;

  raise notice 'Done. Keeper profile updated.';
end $$;

commit;

-- -----------------------------------------------------------------------------
-- 3) POST-CHECK
-- -----------------------------------------------------------------------------

select id, email from auth.users;

select count(*) as listings from public.listings;
select count(*) as bookings from public.bookings;
select count(*) as messages from public.messages;
select count(*) as conversations from public.conversations;
