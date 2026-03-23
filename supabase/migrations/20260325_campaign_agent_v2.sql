-- Campaign Agent v2: A/B tests, registry columns, creative_queue extensions, ab_test_log
-- Safe to run if you already applied manually (IF NOT EXISTS / duplicate policies ignored).

alter table public.adset_registry
  add column if not exists ab_test_parent_id uuid references public.adset_registry(id),
  add column if not exists ab_test_generation integer default 0,
  add column if not exists audience_notes text,
  add column if not exists budget_history jsonb default '[]'::jsonb,
  add column if not exists last_budget_change_at timestamptz,
  add column if not exists warm_up_until date,
  add column if not exists target_cpa_override numeric(10,2);

alter table public.agent_decisions
  add column if not exists parent_entity_id text,
  add column if not exists campaign_id text,
  add column if not exists ab_duplicate_id text,
  add column if not exists human_confirmed_at timestamptz;

alter table public.creative_queue
  add column if not exists queue_type text default 'creative',
  add column if not exists audience_suggestion text,
  add column if not exists audience_type text,
  add column if not exists source_adset_platform_id text;

create table if not exists public.ab_test_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  platform text not null,
  parent_adset_id text not null,
  duplicate_adset_id text not null,
  reason text,
  audience_change text,
  status text default 'RUNNING',
  winner_id text,
  notes text
);

alter table public.ab_test_log enable row level security;
