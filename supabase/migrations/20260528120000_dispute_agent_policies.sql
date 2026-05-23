-- Dispute agent: editable policy store + decision log + support ticket workflow columns.
-- Safe to re-run. Creates agent_policies first so policy save works even if later steps were skipped.

-- ---------------------------------------------------------------------------
-- agent_policies — versioned policy documents read by /api/cron/agent-disputes
-- ---------------------------------------------------------------------------
create table if not exists public.agent_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  content text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_policies_policy_key_uidx
  on public.agent_policies (policy_key);

alter table public.agent_policies enable row level security;

-- ---------------------------------------------------------------------------
-- Seed default dispute resolution policy (editable in admin disputes dashboard)
-- ---------------------------------------------------------------------------
insert into public.agent_policies (policy_key, content, version, is_active)
select
  'dispute_resolution_v1',
  $policy$# thrml dispute resolution policy (v1)

## Principles
- Be fair to guests and hosts. Prefer partial remedies when facts are ambiguous.
- Never auto-resolve safety, legal, or medical issues — escalate to human review.
- Refunds come from the booking payment; platform fees are non-refundable unless billing error.
- Match outcomes to the listing cancellation policy when the dispute is guest-initiated cancellation.

## Categories

### access_failure
Guest could not access the space (wrong code, locked door, host unreachable).
- Verified before session start: full refund.
- Partial access or late resolution: 50–100% refund based on time lost.
- Unverified / guest error: no refund; send_info with access instructions.

### host_no_show
Host did not provide access within 15 minutes of session start.
- full_refund unless host documents extenuating circumstances → flag_for_human.

### guest_no_show
Guest did not arrive; host waited and space was held.
- no_refund per listing policy.

### space_not_as_described
Material mismatch (capacity, amenities, cleanliness, temperature).
- Minor: 25–50% partial_refund.
- Major / unusable: full_refund.
- Subjective preference only: no_refund + send_info.

### early_termination
Session ended early by guest or host.
- Guest left early without host fault: no_refund.
- Host ended early or space unusable: prorated partial_refund.

### billing_error
Duplicate charge, wrong amount, failed session but charged.
- full_refund or partial_refund to correct amount.

### general_help
Non-dispute questions → send_info or no_action.

### unclear
Insufficient facts → flag_for_human.

## Auto-execution
Only execute automatically when confidence is high AND requires_human_review is false.
All other outcomes stay in pending_human for admin approval.$policy$,
  1,
  true
where not exists (
  select 1 from public.agent_policies where policy_key = 'dispute_resolution_v1'
);

-- ---------------------------------------------------------------------------
-- support_requests — columns used by dispute agent + admin inbox
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.support_requests') is null then
    raise notice 'support_requests table not found — skipping support_requests columns and dispute_decisions';
    return;
  end if;

  alter table public.support_requests
    add column if not exists status text default 'open';

  alter table public.support_requests
    add column if not exists created_at timestamptz default now();

  alter table public.support_requests
    add column if not exists ticket_number text;

  alter table public.support_requests
    add column if not exists priority text not null default 'normal';

  alter table public.support_requests
    add column if not exists user_id uuid references public.profiles (id) on delete set null;

  alter table public.support_requests
    add column if not exists dispute_type text;

  alter table public.support_requests
    add column if not exists agent_run_at timestamptz;

  alter table public.support_requests
    add column if not exists resolution_source text;

  alter table public.support_requests
    add column if not exists resolved_at timestamptz;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_requests'
      and column_name = 'created_at'
  ) then
    execute 'create index if not exists support_requests_status_created_idx on public.support_requests (status, created_at desc)';
  end if;

  create index if not exists support_requests_dispute_type_idx
    on public.support_requests (dispute_type)
    where dispute_type is not null;
end $$;

-- ---------------------------------------------------------------------------
-- dispute_decisions — one row per agent classification / human override
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.support_requests') is null then
    return;
  end if;

  execute $ddl$
    create table if not exists public.dispute_decisions (
      id uuid primary key default gen_random_uuid(),
      support_request_id uuid not null references public.support_requests (id) on delete cascade,
      ticket_number text,
      booking_id text,
      booking_status text,
      total_charged numeric(12, 2),
      session_date date,
      hours_until_session numeric(10, 2),
      cancellation_policy text,
      dispute_category text,
      confidence text,
      classification_reasoning text,
      recommended_action text,
      refund_amount numeric(12, 2),
      refund_pct numeric(5, 2),
      host_penalty_pct numeric(5, 2),
      requires_human_review boolean not null default false,
      human_review_reason text,
      claude_raw_response text,
      action_taken text,
      action_executed boolean not null default false,
      execution_error text,
      stripe_refund_id text,
      overridden_by_human uuid,
      override_note text,
      created_at timestamptz not null default now()
    )
  $ddl$;

  create index if not exists dispute_decisions_support_request_idx
    on public.dispute_decisions (support_request_id, created_at desc);

  alter table public.dispute_decisions enable row level security;
end $$;

-- PostgREST must reload before the app can see new tables.
notify pgrst, 'reload schema';
