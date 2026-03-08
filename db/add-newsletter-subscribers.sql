create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'homepage',
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz,
  is_active boolean default true
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Service role only" on public.newsletter_subscribers;
create policy "Service role only"
  on public.newsletter_subscribers
  using (false);
