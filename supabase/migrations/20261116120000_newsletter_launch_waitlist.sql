-- Guest launch list: reuse newsletter_subscribers instead of a second email table.
-- launch_notify marks people who asked to hear when bookings open (homepage pre-launch form,
-- paid guest landing page). The launch-day send stamps launch_notified_at so nobody gets it twice.
alter table public.newsletter_subscribers
  add column if not exists launch_notify boolean not null default false,
  add column if not exists launch_notified_at timestamptz,
  add column if not exists signup_path text,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text;

comment on column public.newsletter_subscribers.launch_notify is
  'True when the subscriber asked to be emailed when guest bookings open.';
comment on column public.newsletter_subscribers.launch_notified_at is
  'When the launch-day announcement was sent to this subscriber.';
comment on column public.newsletter_subscribers.signup_path is
  'Page path the subscriber signed up from (e.g. /go/saunas/seattle).';

create index if not exists idx_newsletter_subscribers_launch_pending
  on public.newsletter_subscribers (subscribed_at)
  where launch_notify and is_active and launch_notified_at is null;
