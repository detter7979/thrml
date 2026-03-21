create table if not exists public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  channel text not null,
  campaign_id text not null default '',
  campaign_name text not null default '',
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  spend numeric not null default 0,
  sessions bigint not null default 0,
  view_listing bigint not null default 0,
  begin_checkout bigint not null default 0,
  purchases bigint not null default 0,
  revenue numeric not null default 0,
  bookings_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  ctr double precision generated always as (
    case
      when impressions > 0 then clicks::double precision / impressions::double precision
      else 0
    end
  ) stored,
  cvr_session_to_purchase double precision generated always as (
    case
      when sessions > 0 then purchases::double precision / sessions::double precision
      else 0
    end
  ) stored,
  cvr_checkout_to_purchase double precision generated always as (
    case
      when begin_checkout > 0 then purchases::double precision / begin_checkout::double precision
      else 0
    end
  ) stored,
  cpa double precision generated always as (
    case
      when purchases > 0 then spend::double precision / purchases::double precision
      else 0
    end
  ) stored,
  roas double precision generated always as (
    case
      when spend > 0 then revenue::double precision / spend::double precision
      else 0
    end
  ) stored,
  unique (date, channel, campaign_id)
);

create index if not exists analytics_daily_date_idx on public.analytics_daily (date desc);
create index if not exists analytics_daily_channel_idx on public.analytics_daily (channel);

alter table public.analytics_daily enable row level security;
