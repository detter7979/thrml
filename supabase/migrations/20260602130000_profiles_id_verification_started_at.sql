-- Timestamp when a host last started Stripe Identity verification (for follow-up emails).
alter table public.profiles
  add column if not exists id_verification_started_at timestamptz;

comment on column public.profiles.id_verification_started_at is
  'Set when the host starts Stripe Identity verification; used for abandoned-session follow-ups.';

notify pgrst, 'reload schema';
