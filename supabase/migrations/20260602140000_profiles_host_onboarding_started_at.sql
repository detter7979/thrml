-- Idempotency anchor for Meta host_onboarding_started (CAPI fires once per user).
alter table public.profiles
  add column if not exists host_onboarding_started_at timestamptz null;

comment on column public.profiles.host_onboarding_started_at is
  'First time the host entered the listing wizard (/dashboard/host/new); gates Meta host_onboarding_started CAPI.';
