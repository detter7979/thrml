-- Optional home market for weekly digest personalization (nullable = show a diverse mix).
alter table if exists public.newsletter_subscribers
  add column if not exists market_city text,
  add column if not exists market_state text;

comment on column public.newsletter_subscribers.market_city is 'Optional subscriber market for listing digest (e.g. Seattle)';
comment on column public.newsletter_subscribers.market_state is 'Optional state/region paired with market_city';
