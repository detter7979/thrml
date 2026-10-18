-- Supabase advisor: extensions belong outside the public schema. Only indexes use them
-- (campaign name trigram search, booked_slots overlap guard), which reference them by OID.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
alter extension btree_gist set schema extensions;
