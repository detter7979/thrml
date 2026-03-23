-- Run after your manual agent DDL. Adds columns and indexes the Next.js agent expects.

alter table public.agent_config add column if not exists last_run_at timestamptz;
alter table public.agent_config add column if not exists next_run_at timestamptz;

-- Ensures a single config row per platform for PATCH / cron updates.
create unique index if not exists agent_config_platform_uidx on public.agent_config (platform);

alter table public.agent_decisions add column if not exists parent_entity_id text;
alter table public.agent_decisions add column if not exists campaign_id text;
alter table public.agent_decisions add column if not exists human_confirmed_at timestamptz;

create index if not exists agent_decisions_evaluated_at_idx on public.agent_decisions (evaluated_at desc);
