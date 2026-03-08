-- Adds host-level default house rules for re-use across listings.
-- Safe to run multiple times.

alter table if exists public.profiles
add column if not exists house_rules text[] default '{}'::text[];
