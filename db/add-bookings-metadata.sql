-- Mirrors supabase/migrations/20260327_bookings_metadata.sql
alter table public.bookings
add column if not exists metadata jsonb not null default '{}'::jsonb;
