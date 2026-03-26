-- listing_reviews (guest reviews after completed bookings)

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  host_id uuid references public.profiles (id) on delete set null,
  rating integer not null,
  rating_overall integer not null,
  rating_cleanliness integer,
  rating_accuracy integer,
  rating_communication integer,
  rating_value integer,
  sub_ratings jsonb not null default '{}'::jsonb,
  comment text,
  photo_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  host_response text,
  host_responded_at timestamptz,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_reviews_booking_id_key unique (booking_id)
);

create index if not exists listing_reviews_listing_id_idx on public.listing_reviews (listing_id);
create index if not exists listing_reviews_guest_id_idx on public.listing_reviews (guest_id);
create index if not exists listing_reviews_host_id_idx on public.listing_reviews (host_id);

create or replace function public.listing_reviews_set_host_id()
returns trigger
language plpgsql
as $$
begin
  if new.host_id is null and new.listing_id is not null then
    select l.host_id into new.host_id from public.listings l where l.id = new.listing_id;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_reviews_set_host_id_trigger on public.listing_reviews;
create trigger listing_reviews_set_host_id_trigger
before insert on public.listing_reviews
for each row
execute function public.listing_reviews_set_host_id();

alter table public.listing_reviews enable row level security;

drop policy if exists listing_reviews_public_select_published on public.listing_reviews;
create policy listing_reviews_public_select_published
on public.listing_reviews
for select
to anon, authenticated
using (coalesce(is_published, true) = true);

drop policy if exists listing_reviews_guest_select_own on public.listing_reviews;
create policy listing_reviews_guest_select_own
on public.listing_reviews
for select
to authenticated
using (guest_id = auth.uid());

drop policy if exists listing_reviews_host_select_listing on public.listing_reviews;
create policy listing_reviews_host_select_listing
on public.listing_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_reviews.listing_id
      and l.host_id = auth.uid()
  )
);

drop policy if exists listing_reviews_insert_completed_booking_user on public.listing_reviews;
create policy listing_reviews_insert_completed_booking_user
on public.listing_reviews
for insert
to authenticated
with check (
  guest_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = listing_reviews.booking_id
      and b.guest_id = auth.uid()
      and b.status = 'completed'
  )
);

grant select on public.listing_reviews to anon, authenticated;
grant select, insert, update, delete on public.listing_reviews to service_role;
