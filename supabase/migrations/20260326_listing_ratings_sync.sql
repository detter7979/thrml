-- Aggregates for listing cards / explore embeds (listing_ratings(...))
-- Kept in sync automatically from public.listing_reviews.
--
-- If you see: "listing_ratings is not a table" — the name was almost certainly a VIEW
-- (common in older schemas). This block removes that so we can use a real base table.

do $replace_legacy_listing_ratings$
begin
  if exists (
    select 1 from pg_catalog.pg_views v
    where v.schemaname = 'public' and v.viewname = 'listing_ratings'
  ) then
    execute 'drop view public.listing_ratings cascade';
  end if;
  if exists (
    select 1 from pg_catalog.pg_matviews m
    where m.schemaname = 'public' and m.matviewname = 'listing_ratings'
  ) then
    execute 'drop materialized view public.listing_ratings cascade';
  end if;
end
$replace_legacy_listing_ratings$;

create table if not exists public.listing_ratings (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  avg_overall numeric(4, 2) not null default 0,
  avg_rating numeric(4, 2) not null default 0,
  review_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.listing_ratings is 'Denormalized review stats; maintained by triggers on listing_reviews.';

create or replace function public.refresh_listing_ratings_aggregate(p_listing_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.listing_ratings where listing_id = p_listing_id;

  insert into public.listing_ratings (listing_id, avg_overall, avg_rating, review_count, updated_at)
  select
    p_listing_id,
    round(avg(rating_overall)::numeric, 2),
    round(avg(rating_overall)::numeric, 2),
    count(*)::integer,
    now()
  from public.listing_reviews
  where listing_id = p_listing_id
    and coalesce(is_published, true) = true
  having count(*) > 0;
end;
$$;

create or replace function public.listing_reviews_touch_listing_ratings()
returns trigger
language plpgsql
as $$
declare
  lid uuid;
begin
  lid := coalesce(new.listing_id, old.listing_id);
  if lid is not null then
    perform public.refresh_listing_ratings_aggregate(lid);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists listing_reviews_aggregate_ratings on public.listing_reviews;
create trigger listing_reviews_aggregate_ratings
after insert or update or delete on public.listing_reviews
for each row
execute function public.listing_reviews_touch_listing_ratings();

-- Backfill from existing reviews
insert into public.listing_ratings (listing_id, avg_overall, avg_rating, review_count, updated_at)
select
  listing_id,
  round(avg(rating_overall)::numeric, 2),
  round(avg(rating_overall)::numeric, 2),
  count(*)::integer,
  now()
from public.listing_reviews
where coalesce(is_published, true) = true
group by listing_id
on conflict (listing_id) do update set
  avg_overall = excluded.avg_overall,
  avg_rating = excluded.avg_rating,
  review_count = excluded.review_count,
  updated_at = excluded.updated_at;

alter table public.listing_ratings enable row level security;

drop policy if exists listing_ratings_public_select on public.listing_ratings;
create policy listing_ratings_public_select
on public.listing_ratings
for select
to anon, authenticated
using (true);

grant select on public.listing_ratings to anon, authenticated;
grant select, insert, update, delete on public.listing_ratings to service_role;
