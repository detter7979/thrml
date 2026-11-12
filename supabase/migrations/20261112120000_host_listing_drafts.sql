-- Host listing drafts: the new-listing wizard autosaves here so hosts can leave and
-- resume, and the lifecycle cron can remind them ("you're 60% done").
-- One draft per host (the wizard only creates one listing at a time).

create table if not exists public.host_listing_drafts (
  host_id uuid primary key references auth.users (id) on delete cascade,
  step integer not null default 1,
  total_steps integer not null default 5,
  form jsonb not null default '{}'::jsonb,
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_listing_drafts enable row level security;

drop policy if exists host_listing_drafts_select_own on public.host_listing_drafts;
create policy host_listing_drafts_select_own on public.host_listing_drafts
  for select to authenticated using (host_id = auth.uid());

drop policy if exists host_listing_drafts_insert_own on public.host_listing_drafts;
create policy host_listing_drafts_insert_own on public.host_listing_drafts
  for insert to authenticated with check (host_id = auth.uid());

drop policy if exists host_listing_drafts_update_own on public.host_listing_drafts;
create policy host_listing_drafts_update_own on public.host_listing_drafts
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists host_listing_drafts_delete_own on public.host_listing_drafts;
create policy host_listing_drafts_delete_own on public.host_listing_drafts
  for delete to authenticated using (host_id = auth.uid());

create index if not exists host_listing_drafts_updated_at_idx
  on public.host_listing_drafts (updated_at);
