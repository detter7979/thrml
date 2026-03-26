-- Optional JSON bag for admin-facing flags (e.g. legal / compliance review).
alter table public.bookings
add column if not exists metadata jsonb not null default '{}'::jsonb;
