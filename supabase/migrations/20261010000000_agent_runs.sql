-- Run log written by every /api/cron/agent-* job (15 call sites). The table was never
-- created, so every insert/update failed silently and run history was lost.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  results jsonb,
  error_message text,
  claude_input_tokens integer,
  claude_output_tokens integer
);

create index if not exists agent_runs_started_at_idx on public.agent_runs (started_at desc);
create index if not exists agent_runs_agent_started_idx on public.agent_runs (agent_name, started_at desc);

-- Server-only: cron jobs and /api/admin/* use the service role. No client policies.
alter table public.agent_runs enable row level security;
revoke all on public.agent_runs from anon, authenticated;
