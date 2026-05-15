-- Align meta_executions.attempt CHECK with app behavior (src/lib/agent/meta-ads-agent/index.ts):
-- - Inserts use attempt = 0 (pending / not yet tried).
-- - Each failure bumps attempt; terminal failure sets attempt = 4.
-- Some environments were provisioned with a stricter check (e.g. attempt >= 1), which breaks inserts.

alter table public.meta_executions
  drop constraint if exists meta_executions_attempt_check;

alter table public.meta_executions
  add constraint meta_executions_attempt_check check (attempt >= 0 and attempt <= 20);
