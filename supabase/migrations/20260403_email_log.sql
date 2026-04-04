-- Tracks every marketing/lifecycle email sent to prevent duplicate sends.
-- Transactional booking emails use boolean flags on the bookings table instead.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email_type text not null,
  reference_id text,
  sent_at timestamptz default now(),
  resend_id text,
  unique (user_id, email_type, reference_id)
);

alter table public.email_log enable row level security;
create policy "Service role only" on public.email_log using (false);

create index if not exists idx_email_log_user_type
  on public.email_log (user_id, email_type);

-- Tracks whether a user has received their onboarding welcome email.
-- Stored on profiles to allow quick lookup without a join.
-- Note: profiles already has is_host boolean; no role column needed.
alter table public.profiles
  add column if not exists onboarding_email_sent boolean default false;

comment on column public.profiles.onboarding_email_sent is
  'True once the welcome onboarding email has been sent to this user.';
