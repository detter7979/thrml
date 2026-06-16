-- Item 2: stop public/anon from listing every object in the public buckets.
-- These DROPs were applied live via the SQL editor but never tracked as a
-- migration -- this file captures them. Public buckets still serve objects by
-- URL after this; only the storage .list() API is closed off.
--
-- Idempotent (IF EXISTS). This change is ALREADY LIVE, so either let
-- `supabase db push` no-op it, or register it without running via:
--   supabase migration repair --status applied 20260615230000

drop policy if exists "Anyone can view photos" on storage.objects;   -- listing-photos
drop policy if exists "avatars_public_read"    on storage.objects;   -- avatars
