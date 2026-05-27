-- guest_reviews (host reviews of guests after completed bookings)

create table if not exists public.guest_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  rating_overall integer not null check (rating_overall between 1 and 5),
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_reviews_booking_id_key unique (booking_id)
);

create index if not exists guest_reviews_guest_id_idx on public.guest_reviews (guest_id);
create index if not exists guest_reviews_host_id_idx on public.guest_reviews (host_id);
create index if not exists guest_reviews_listing_id_idx on public.guest_reviews (listing_id);

alter table public.bookings
  add column if not exists host_review_submitted boolean not null default false;

-- Denormalized guest reputation stats
create table if not exists public.guest_ratings (
  guest_id uuid primary key references public.profiles (id) on delete cascade,
  avg_overall numeric(4, 2) not null default 0,
  review_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.guest_ratings is 'Denormalized guest review stats; maintained by triggers on guest_reviews.';

create or replace function public.refresh_guest_ratings_aggregate(p_guest_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.guest_ratings where guest_id = p_guest_id;

  insert into public.guest_ratings (guest_id, avg_overall, review_count, updated_at)
  select
    p_guest_id,
    round(avg(rating_overall)::numeric, 2),
    count(*)::integer,
    now()
  from public.guest_reviews
  where guest_id = p_guest_id
    and coalesce(is_published, true) = true
  having count(*) > 0;
end;
$$;

create or replace function public.guest_reviews_touch_guest_ratings()
returns trigger
language plpgsql
as $$
declare
  gid uuid;
begin
  gid := coalesce(new.guest_id, old.guest_id);
  if gid is not null then
    perform public.refresh_guest_ratings_aggregate(gid);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guest_reviews_aggregate_ratings on public.guest_reviews;
create trigger guest_reviews_aggregate_ratings
after insert or update or delete on public.guest_reviews
for each row
execute function public.guest_reviews_touch_guest_ratings();

alter table public.guest_reviews enable row level security;
alter table public.guest_ratings enable row level security;

drop policy if exists guest_reviews_public_select_published on public.guest_reviews;
create policy guest_reviews_public_select_published
on public.guest_reviews
for select
to anon, authenticated
using (coalesce(is_published, true) = true);

drop policy if exists guest_reviews_host_select_own on public.guest_reviews;
create policy guest_reviews_host_select_own
on public.guest_reviews
for select
to authenticated
using (host_id = auth.uid());

drop policy if exists guest_reviews_guest_select_own on public.guest_reviews;
create policy guest_reviews_guest_select_own
on public.guest_reviews
for select
to authenticated
using (guest_id = auth.uid());

drop policy if exists guest_reviews_insert_completed_booking_host on public.guest_reviews;
create policy guest_reviews_insert_completed_booking_host
on public.guest_reviews
for insert
to authenticated
with check (
  host_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = guest_reviews.booking_id
      and b.host_id = auth.uid()
      and b.status = 'completed'
  )
);

drop policy if exists guest_ratings_public_select on public.guest_ratings;
create policy guest_ratings_public_select
on public.guest_ratings
for select
to anon, authenticated
using (true);

grant select on public.guest_reviews to anon, authenticated;
grant select on public.guest_ratings to anon, authenticated;
grant select, insert, update, delete on public.guest_reviews to service_role;
grant select, insert, update, delete on public.guest_ratings to service_role;
