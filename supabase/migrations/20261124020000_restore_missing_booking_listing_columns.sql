-- Columns the app reads and writes that were never created in production.
-- Without bookings.metadata the Stripe webhook's booking lookup fails, so paid bookings never confirm.
alter table public.bookings
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.listings
  add column if not exists access_code_send_timing text not null default '24h_before',
  add column if not exists access_code_template text,
  add column if not exists house_rules_custom text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_access_code_send_timing_check') then
    alter table public.listings add constraint listings_access_code_send_timing_check
      check (access_code_send_timing in ('on_confirm', '24h_before', '1h_before'));
  end if;
end $$;

comment on column public.bookings.metadata is 'Booking flags set by the server (e.g. legal exceptions from waiver checks).';
comment on column public.listings.access_code_send_timing is 'When access details go out: on_confirm, 24h_before (day before), 1h_before (morning of).';
