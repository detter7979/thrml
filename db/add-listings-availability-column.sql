-- Adds the weekly availability JSON payload used by booking widgets.
-- Safe to run multiple times.
alter table if exists public.listings
add column if not exists availability jsonb not null default '[]'::jsonb;
