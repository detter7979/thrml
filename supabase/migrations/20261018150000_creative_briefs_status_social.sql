-- The status check was rebuilt without the organic social statuses, so the daily social agent's
-- drafts were rejected ("violates check constraint creative_briefs_status_check").
alter table public.creative_briefs drop constraint if exists creative_briefs_status_check;
alter table public.creative_briefs add constraint creative_briefs_status_check check (status = any (array[
  'pending','briefed','generating','variations_ready','approved','rejected','launched','done',
  'social_draft','social_approved','social_rejected','published'
])) not valid;
