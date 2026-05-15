alter table public.bookings
  add column if not exists rescheduled_at timestamptz,
  add column if not exists rescheduled_by text,
  add column if not exists reschedule_reason text,
  add column if not exists previous_session_date date,
  add column if not exists previous_start_time time,
  add column if not exists previous_end_time time;

comment on column public.bookings.rescheduled_at is 'When the booking was last moved to a new session time.';
comment on column public.bookings.rescheduled_by is 'guest or host — who initiated the last reschedule.';
