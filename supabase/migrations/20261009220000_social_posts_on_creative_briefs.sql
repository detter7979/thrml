-- Organic social posts live in creative_briefs (trigger_type = 'social') instead of the
-- never-created creative_queue table. Statuses: social_draft -> social_approved -> published
-- (or social_rejected). These statuses are outside the paid-ad brief list, so social posts
-- never enter the Meta ad generation/launch flow.
alter table public.creative_briefs
  add column if not exists published_at timestamptz,
  add column if not exists publish_platform_id text;

create index if not exists creative_briefs_social_status_idx
  on public.creative_briefs (trigger_type, status, created_at desc)
  where trigger_type = 'social';
