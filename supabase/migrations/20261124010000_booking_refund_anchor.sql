-- Earliest start time a guest has held for a booking. Set when a guest reschedules, so refund
-- windows are measured from the original session and moving a booking later can't be used
-- to get a larger refund. Null means "use the current session start".
alter table public.bookings
  add column if not exists refund_anchor_at timestamptz;

comment on column public.bookings.refund_anchor_at is
  'Earliest guest-held session start; refund windows are measured from the earlier of this and the current start.';

-- The old calculate_refund() disagreed with the listing policies and was never reached
-- (the app called it with the wrong argument names). Refunds are computed in
-- src/lib/cancellations.ts computeRefund().
drop function if exists public.calculate_refund(uuid, text);
