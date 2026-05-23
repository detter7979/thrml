alter table public.bookings
  add column if not exists refund_amount numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists refunded_amount numeric(10, 2) not null default 0;

alter table public.bookings
  add column if not exists refunded_at timestamptz;

alter table public.bookings
  add column if not exists stripe_refund_id text;

-- Keep legacy + new refund columns aligned when only one was populated.
update public.bookings
set refunded_amount = refund_amount
where refunded_amount = 0 and refund_amount > 0;

update public.bookings
set refund_amount = refunded_amount
where refund_amount = 0 and refunded_amount > 0;
