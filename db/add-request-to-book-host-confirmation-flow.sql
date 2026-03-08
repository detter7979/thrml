-- Request-to-book host confirmation flow support.
-- Safe to run multiple times.

alter table if exists public.bookings
  drop constraint if exists bookings_status_check;

alter table if exists public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending_host',
      'pending',
      'confirmed',
      'cancelled',
      'completed',
      'declined'
    )
  );

alter table if exists public.bookings
  add column if not exists host_actioned_at timestamptz,
  add column if not exists host_decline_reason text,
  add column if not exists confirmation_deadline timestamptz;

create index if not exists idx_bookings_pending_host
  on public.bookings (status, confirmation_deadline)
  where status = 'pending_host';
