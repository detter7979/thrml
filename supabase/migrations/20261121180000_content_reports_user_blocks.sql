-- Reporting and blocking for user-generated content (App Store guideline 1.2).
-- Reports are written through /api/reports (service role) and reviewed in /admin/reports.
-- Blocks stop two people messaging each other; enforced in /api/messages.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'review', 'message', 'user')),
  target_id uuid not null,
  reported_user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason text not null check (
    reason in ('inappropriate', 'harassment', 'spam', 'misleading', 'safety', 'discrimination', 'other')
  ),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id);
-- One open report per person per item; repeat taps update nothing.
create unique index if not exists content_reports_one_open_per_target
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.content_reports enable row level security;

drop policy if exists "Reporters can read their own reports" on public.content_reports;
create policy "Reporters can read their own reports"
  on public.content_reports for select
  to authenticated
  using (reporter_id = auth.uid());

revoke all on public.content_reports from anon;

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "People can see who they blocked" on public.user_blocks;
create policy "People can see who they blocked"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "People can block others" on public.user_blocks;
create policy "People can block others"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "People can unblock" on public.user_blocks;
create policy "People can unblock"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

revoke all on public.user_blocks from anon;

-- True when either person has blocked the other. Security definer so it can see blocks the caller
-- didn't make (user_blocks RLS only shows your own).
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- Direct inserts from the app can't message someone across a block. Server-side sends (service
-- role) skip RLS; /api/messages checks blocks itself, and booking logistics still go through.
drop policy if exists "No messages across a block" on public.messages;
create policy "No messages across a block"
  on public.messages as restrictive for insert
  to authenticated
  with check (
    not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_blocked_between(
          c.guest_id,
          c.host_id
        )
    )
  );
