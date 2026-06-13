-- Legal documents CMS, acceptance audit log, advertising consent, account deletion.

-- ── legal_documents ─────────────────────────────────────────────────────────
create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  version text not null,
  title text not null,
  body text not null,
  effective_at timestamptz not null default now(),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_documents_doc_type_check check (
    doc_type in (
      'privacy_policy',
      'consumer_health_data_policy',
      'terms_of_service',
      'host_terms'
    )
  )
);

create unique index if not exists legal_documents_one_active_per_type
  on public.legal_documents (doc_type)
  where is_active = true;

create index if not exists legal_documents_doc_type_idx on public.legal_documents (doc_type);

alter table public.legal_documents enable row level security;

create policy "legal_documents_public_read_active"
  on public.legal_documents for select
  using (is_active = true);

-- ── legal_acceptances ─────────────────────────────────────────────────────────
create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  doc_type text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'app',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_id_idx on public.legal_acceptances (user_id);
create index if not exists legal_acceptances_booking_id_idx on public.legal_acceptances (booking_id);
create index if not exists legal_acceptances_doc_type_idx on public.legal_acceptances (doc_type);

alter table public.legal_acceptances enable row level security;

create policy "legal_acceptances_insert_own"
  on public.legal_acceptances for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "legal_acceptances_select_own"
  on public.legal_acceptances for select
  using (auth.uid() = user_id);

-- ── profiles: marketing consent + deletion ────────────────────────────────────
alter table public.profiles
  add column if not exists marketing_consent boolean null,
  add column if not exists marketing_consent_at timestamptz null,
  add column if not exists deletion_requested_at timestamptz null,
  add column if not exists is_deleted boolean not null default false;

comment on column public.profiles.marketing_consent is
  'User opted in to advertising/Meta Pixel tracking (synced from cookie banner).';
comment on column public.profiles.marketing_consent_at is
  'Timestamp of last marketing_consent change.';
comment on column public.profiles.deletion_requested_at is
  'When set, account enters 30-day grace period before anonymization.';

-- ── bookings: device disclosure (acceptance logging) ──────────────────────────
alter table public.bookings
  add column if not exists device_disclosure_acknowledged boolean null,
  add column if not exists device_disclosure_acknowledged_at timestamptz null;

-- ── Safety-net triggers (app insert with IP/UA is primary) ──────────────────
create or replace function public.log_profile_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.terms_accepted is true and (old.terms_accepted is distinct from true) then
      insert into public.legal_acceptances (user_id, doc_type, version, source)
      values (new.id, 'terms_of_service', coalesce(new.terms_version, 'unknown'), 'trigger');
    end if;
    if new.host_terms_accepted is true and (old.host_terms_accepted is distinct from true) then
      insert into public.legal_acceptances (user_id, doc_type, version, source)
      values (new.id, 'host_terms', coalesce(new.host_terms_version, 'unknown'), 'trigger');
    end if;
    if new.insurance_attested is true and (old.insurance_attested is distinct from true) then
      insert into public.legal_acceptances (user_id, doc_type, version, source)
      values (new.id, 'insurance_attestation', coalesce(new.insurance_attestation_version, 'unknown'), 'trigger');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_legal_acceptance_trigger on public.profiles;
create trigger profiles_legal_acceptance_trigger
  after update on public.profiles
  for each row
  execute function public.log_profile_legal_acceptance();

create or replace function public.log_booking_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.waiver_accepted is true and (old.waiver_accepted is distinct from true) then
      insert into public.legal_acceptances (user_id, booking_id, doc_type, version, source)
      values (
        new.guest_id,
        new.id,
        'session_waiver',
        coalesce(new.waiver_version, 'unknown'),
        'trigger'
      );
    end if;
    if new.device_disclosure_acknowledged is true
       and (old.device_disclosure_acknowledged is distinct from true) then
      insert into public.legal_acceptances (user_id, booking_id, doc_type, version, source)
      values (new.guest_id, new.id, 'device_disclosure', 'v1', 'trigger');
    end if;
  elsif tg_op = 'INSERT' then
    if new.waiver_accepted is true then
      insert into public.legal_acceptances (user_id, booking_id, doc_type, version, source)
      values (
        new.guest_id,
        new.id,
        'session_waiver',
        coalesce(new.waiver_version, 'unknown'),
        'trigger'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_legal_acceptance_trigger on public.bookings;
create trigger bookings_legal_acceptance_trigger
  after insert or update on public.bookings
  for each row
  execute function public.log_booking_legal_acceptance();
