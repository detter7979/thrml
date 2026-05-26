-- Safety & access fields for host listing onboarding (Step 1 — Service details).

alter table public.listings
  add column if not exists door_operation text,
  add column if not exists access_method text,
  add column if not exists host_availability text,
  add column if not exists emergency_contact text,
  add column if not exists controls_in_reach boolean,
  add column if not exists has_ventilation boolean,
  add column if not exists safety_amenities text[] not null default '{}';
