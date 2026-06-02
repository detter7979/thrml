-- Prevent duplicate "your request has been resolved" emails per support ticket.
alter table public.support_requests
  add column if not exists resolution_email_sent_at timestamptz;

comment on column public.support_requests.resolution_email_sent_at is
  'When the guest resolution email was sent; used to dedupe agent + human approve paths.';

notify pgrst, 'reload schema';
