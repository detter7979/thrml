alter table public.bookings
add column if not exists reminder_24h_sent boolean default false,
add column if not exists reminder_24h_sent_at timestamptz,
add column if not exists post_session_email_sent boolean default false;
