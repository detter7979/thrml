-- =============================================================================
-- Delete mock / test support inbox data (and linked dispute + incident rows).
--
-- Run AFTER wipe-platform-data-keep-dom.sql if you cleared bookings first.
-- Run in Supabase SQL Editor (postgres / service role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREVIEW
-- -----------------------------------------------------------------------------

select count(*) as total_support_requests from public.support_requests;

select
  id,
  ticket_number,
  status,
  dispute_type,
  email,
  subject,
  left(message, 80) as message_preview,
  booking_id,
  created_at
from public.support_requests
order by created_at desc
limit 50;

select case
  when to_regclass('public.dispute_decisions') is not null
  then (select count(*) from public.dispute_decisions)
  else 0
end as dispute_decisions;

select case
  when to_regclass('public.incident_reports') is not null
  then (select count(*) from public.incident_reports)
  else 0
end as incident_reports;

-- -----------------------------------------------------------------------------
-- 2) DELETE ALL support requests (full inbox reset)
--    To keep tickets you filed as Dom, use the OPTIONAL block in section 3.
-- -----------------------------------------------------------------------------

begin;

do $$
begin
  if to_regclass('public.dispute_decisions') is not null then
    delete from public.dispute_decisions;
  end if;

  if to_regclass('public.incident_reports') is not null then
    delete from public.incident_reports
    where support_request_id is not null;
  end if;

  delete from public.support_requests;
end $$;

commit;

-- -----------------------------------------------------------------------------
-- 3) POST-CHECK
-- -----------------------------------------------------------------------------

select count(*) as remaining_support_requests from public.support_requests;

-- -----------------------------------------------------------------------------
-- OPTIONAL — keep only tickets submitted with Dom’s email (uncomment instead
-- of the DELETE ALL block above if you prefer)
-- -----------------------------------------------------------------------------
/*
begin;

if to_regclass('public.dispute_decisions') is not null then
  delete from public.dispute_decisions dd
  where dd.support_request_id in (
    select sr.id from public.support_requests sr
    where lower(trim(sr.email)) <> 'etter.dom@gmail.com'
  );
end if;

if to_regclass('public.incident_reports') is not null then
  delete from public.incident_reports ir
  where ir.support_request_id in (
    select sr.id from public.support_requests sr
    where lower(trim(sr.email)) <> 'etter.dom@gmail.com'
  );
end if;

delete from public.support_requests sr
where lower(trim(sr.email)) <> 'etter.dom@gmail.com';

commit;
*/
