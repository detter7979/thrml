-- Host funnel counts (from GA4) next to the guest funnel on the admin Analytics page.
alter table public.analytics_daily
  add column if not exists become_host_click integer not null default 0,
  add column if not exists host_onboarding_started integer not null default 0,
  add column if not exists host_first_listing_created integer not null default 0;
