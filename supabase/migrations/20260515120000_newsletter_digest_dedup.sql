-- Prevent sending the weekly listing digest more than once per subscriber per week.
alter table public.newsletter_subscribers
  add column if not exists last_weekly_digest_sent_at timestamptz;

comment on column public.newsletter_subscribers.last_weekly_digest_sent_at is
  'Last time the weekly spaces digest email was sent to this address.';

create index if not exists idx_newsletter_subscribers_digest_sent
  on public.newsletter_subscribers (last_weekly_digest_sent_at)
  where is_active = true;
