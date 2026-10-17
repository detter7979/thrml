-- Unified paid media reporting: platform ad-level daily rows, GA4 by UTM, first-party UTMs on bookings.
-- Names and naming fields are NOT stored here: they are joined at read time from campaigns / ad_sets / ads
-- (synced from the namer), so fixing a namer row fixes every past day.

create table if not exists public.report_platform_daily (
  date            date        not null,
  platform        text        not null check (platform in ('meta', 'google')),
  ad_id           text        not null,
  adset_id        text        not null default '',
  campaign_id     text        not null default '',
  ad_name         text        not null default '',
  adset_name      text        not null default '',
  campaign_name   text        not null default '',
  spend           numeric(12,2) not null default 0,
  impressions     bigint      not null default 0,
  reach           bigint      not null default 0,
  clicks          bigint      not null default 0,
  link_clicks     bigint      not null default 0,
  conversions     jsonb       not null default '{}'::jsonb,  -- { "BH": 3, "VC": 40, "PUR": 1, ... }
  revenue         numeric(12,2) not null default 0,
  is_test         boolean     not null default false,
  updated_at      timestamptz not null default now(),
  primary key (date, platform, ad_id, is_test)
);
create index if not exists report_platform_daily_date_idx on public.report_platform_daily (date);

create table if not exists public.report_ga4_daily (
  date              date   not null,
  source            text   not null default '',
  medium            text   not null default '',
  campaign          text   not null default '',
  utm_id            text   not null default '',
  term              text   not null default '',
  content           text   not null default '',
  sessions          integer not null default 0,
  engaged_sessions  integer not null default 0,
  events            jsonb  not null default '{}'::jsonb,  -- { "view_item": 12, "begin_checkout": 2, ... }
  revenue           numeric(12,2) not null default 0,
  is_test           boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (date, source, medium, campaign, utm_id, term, content, is_test)
);
create index if not exists report_ga4_daily_date_idx on public.report_ga4_daily (date);

alter table public.report_platform_daily enable row level security;
alter table public.report_ga4_daily enable row level security;

-- First-touch UTMs captured on the site and stamped on the booking (first-party attribution).
alter table public.bookings
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_id       text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  add column if not exists click_id     text;

insert into public.platform_settings (key, value) values
  ('gdrive_cleaned_report_id', '"1NbZVKoA2YczqFcTsQPj5Dr8CP3p_wl_mwE5-r9rvolg"'),
  ('gdrive_meta_raw_report_id', '"1e1mMBvldc8F2mZZ_2Fb6JAKjELzlPvtweZWZd5HUJEI"'),
  ('gdrive_google_raw_report_id', '"1hZ3xf8RkFKywIgLlNFEEm6DoxnHoAEfAfGV71yMXkvw"'),
  ('gdrive_test_cleaned_report_id', '"1RXVCTClJHg5YAY7l4i0sidnyt7ywb9g3vPmA0a2c138"')
on conflict (key) do update set value = excluded.value;
