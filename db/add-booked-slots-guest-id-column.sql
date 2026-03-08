-- Ensure booked_slots can store reserving guest for atomic reservation RPC.
-- Safe to run multiple times.

alter table if exists public.booked_slots
add column if not exists guest_id uuid references public.profiles(id) on delete set null;

create index if not exists booked_slots_guest_id_idx
  on public.booked_slots (guest_id);
