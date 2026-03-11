-- Tracks whether pre-session access details/reminders were sent.
alter table if exists public.bookings
  add column if not exists access_code_sent boolean not null default false;

alter table if exists public.bookings
  add column if not exists access_code_sent_at timestamptz null;

create index if not exists idx_bookings_access_code_sent
  on public.bookings (access_code_sent, status, session_date);
