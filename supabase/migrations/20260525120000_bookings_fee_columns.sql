-- Backfill missing fee breakdown columns on bookings (partial apply of 20260322 migration).

alter table public.bookings
  add column if not exists guest_fee numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists host_fee numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists guest_total numeric(10, 2);

update public.bookings
set guest_total = total_charged
where guest_total is null and total_charged is not null;

update public.bookings
set guest_fee = coalesce(service_fee, 0)
where guest_fee = 0 and coalesce(service_fee, 0) > 0;

update public.bookings
set host_fee = round((subtotal - host_payout)::numeric, 2)
where host_fee = 0 and subtotal is not null and host_payout is not null;
