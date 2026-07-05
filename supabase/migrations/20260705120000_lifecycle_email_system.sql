-- Lifecycle email system: bi-weekly newsletter tracking + support follow-up flags.

-- Bi-weekly newsletter dedupe for non-account subscribers (accounts dedupe via email_log).
alter table public.newsletter_subscribers
  add column if not exists last_biweekly_sent_at timestamptz,
  add column if not exists last_biweekly_edition text;

comment on column public.newsletter_subscribers.last_biweekly_sent_at is
  'Timestamp of the last bi-weekly benefits newsletter sent to this subscriber.';
comment on column public.newsletter_subscribers.last_biweekly_edition is
  'Edition tag of the last bi-weekly benefits newsletter sent (e.g. edition_3).';

-- Support follow-up emails: pending nudge + escalation notice, sent at most once each.
alter table public.support_requests
  add column if not exists followup_email_sent_at timestamptz,
  add column if not exists escalation_email_sent_at timestamptz;

comment on column public.support_requests.followup_email_sent_at is
  'Set when the "still working on it" pending follow-up email was sent.';
comment on column public.support_requests.escalation_email_sent_at is
  'Set when the escalation notice email was sent to the requester.';
