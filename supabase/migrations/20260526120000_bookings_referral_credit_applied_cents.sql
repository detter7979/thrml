alter table public.bookings
  add column if not exists referral_credit_applied_cents integer not null default 0;
