-- Audit trail for who last changed a setting
alter table public.platform_settings
  add column if not exists updated_by uuid references public.profiles (id) on delete set null;

-- Configurable marketplace fees (read at booking time; never hardcoded in app logic)
insert into public.platform_settings (key, value)
values
  ('guest_fee_percent', '5'::jsonb),
  ('host_fee_percent', '10.5'::jsonb)
on conflict (key) do nothing;

alter table public.bookings
  add column if not exists guest_fee numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists host_fee numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists guest_total numeric(10, 2);

-- Backfill from existing totals where possible
update public.bookings
set guest_total = total_charged
where guest_total is null and total_charged is not null;

update public.bookings
set guest_fee = coalesce(service_fee, 0)
where guest_fee = 0 and coalesce(service_fee, 0) > 0;

update public.bookings
set host_fee = round((subtotal - host_payout)::numeric, 2)
where host_fee = 0 and subtotal is not null and host_payout is not null;
