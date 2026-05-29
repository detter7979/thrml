-- Host insurance attestation (required to publish) and future proof-of-coverage scaffolding.

alter table public.profiles
  add column if not exists insurance_attested boolean not null default false,
  add column if not exists insurance_attested_at timestamptz,
  add column if not exists insurance_attestation_version text,
  add column if not exists insurance_proof_path text,
  add column if not exists insurance_proof_uploaded_at timestamptz,
  add column if not exists insurance_proof_reviewed_at timestamptz,
  add column if not exists insurance_proof_status text not null default 'none';

alter table public.profiles
  drop constraint if exists profiles_insurance_proof_status_check;

alter table public.profiles
  add constraint profiles_insurance_proof_status_check
  check (insurance_proof_status in ('none', 'pending', 'approved', 'expired', 'rejected'));

comment on column public.profiles.insurance_attested is 'Host has affirmed liability insurance coverage (required before listing publish).';
comment on column public.profiles.insurance_attestation_version is 'Version slug of attestation language accepted (e.g. v1-2026-05).';
comment on column public.profiles.insurance_proof_status is 'Future proof upload review state; not enforced at publish today.';
