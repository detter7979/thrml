-- Founding-host phase: hand-picked hosts instead of open self-serve listing.
--  1) host_applications: who applied, whether they own a sauna today, and where they are in review.
--  2) listings.approval_status: new listings wait for admin approval before they can be live.
--     Enforced in the database so every path (create, publish, reactivate, direct updates) obeys it.
--  3) Settings: approval required, application-first host funnel, founding cap of 3.

-- 1) Host applications -------------------------------------------------------------------------
create table if not exists public.host_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null unique,           -- stored lowercased by the API; re-applying updates the row
  full_name text,
  phone text,
  owns_sauna text not null check (owns_sauna in ('yes', 'planning', 'exploring')),
  neighborhood text,
  sauna_type text,
  private_access text check (private_access in ('yes', 'partly', 'no')),
  availability text check (availability in ('1-2', '3-4', '5+')),
  notes text,
  status text not null default 'new'
    check (status in ('new', 'shortlisted', 'founding', 'waitlisted', 'declined', 'converted', 'future')),
  admin_note text,
  user_id uuid references auth.users (id) on delete set null,
  signup_path text,
  utm_source text,
  utm_campaign text
);

comment on table public.host_applications is
  'Host applications from /become-a-host/apply. owns_sauna=yes → review queue; planning/exploring → future-host list (status future).';

create index if not exists idx_host_applications_status on public.host_applications (status, created_at desc);

-- Only the server (service role) reads or writes applications.
alter table public.host_applications enable row level security;

-- 2) Listing approval ---------------------------------------------------------------------------
-- Existing listings are grandfathered as approved; new ones start pending.
alter table public.listings
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'declined')),
  add column if not exists approval_reviewed_at timestamptz,
  add column if not exists approval_note text;

alter table public.listings alter column approval_status set default 'pending';

comment on column public.listings.approval_status is
  'pending until an admin approves; only approved listings can be active (trigger enforce_listing_approval).';

create or replace function public.listing_approval_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings
                   where key = 'require_listing_approval'), false)
$$;

-- Runs as the caller (not security definer) so current_user tells us who is writing.
create or replace function public.enforce_listing_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    if not v_privileged then
      new.approval_status := 'pending';             -- hosts can't self-approve
    end if;
    if new.parent_listing_id is not null and exists (
      select 1 from public.listings p
      where p.id = new.parent_listing_id and p.approval_status = 'approved'
    ) then
      new.approval_status := 'approved';             -- a new version of an approved listing stays approved
    elsif new.approval_status = 'pending' and not public.listing_approval_required() then
      new.approval_status := 'approved';             -- approvals switched off
    end if;
  else
    if not v_privileged and new.approval_status is distinct from old.approval_status then
      new.approval_status := old.approval_status;    -- only admins change approval
      new.approval_reviewed_at := old.approval_reviewed_at;
      new.approval_note := old.approval_note;
    end if;
  end if;

  if new.approval_status <> 'approved' and coalesce(new.is_active, false) then
    new.is_active := false;                          -- not approved → can't be live
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_listing_approval on public.listings;
create trigger trg_enforce_listing_approval
  before insert or update on public.listings
  for each row execute function public.enforce_listing_approval();

-- 3) Settings -----------------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('require_listing_approval', 'true'::jsonb,
   'New listings stay pending until an admin approves them in /admin/listings.'),
  ('host_applications_mode', 'true'::jsonb,
   'Become-a-host CTA sends new visitors to /become-a-host/apply instead of open signup. Invited hosts use /become-a-host?start=1.')
on conflict (key) do update set value = excluded.value, description = excluded.description;

update public.platform_settings set value = '3'::jsonb where key = 'founding_host_cap';
