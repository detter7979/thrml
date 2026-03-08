-- Messaging system schema for booking-scoped host/guest chat.
-- Safe to run multiple times.

alter table if exists public.bookings
add column if not exists automated_messages_sent text[] not null default '{}'::text[];

alter table if exists public.listings
add column if not exists access_instructions text,
add column if not exists onsite_contact_name text,
add column if not exists onsite_contact_phone text;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  message_type text not null default 'text',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- If messages already existed before this migration, ensure required columns are present.
alter table if exists public.messages
add column if not exists conversation_id uuid references public.conversations(id) on delete cascade,
add column if not exists sender_id uuid references public.profiles(id) on delete cascade,
add column if not exists body text,
add column if not exists content text,
add column if not exists message_type text not null default 'text',
add column if not exists read_at timestamptz,
add column if not exists created_at timestamptz not null default now();

-- Backfill "body" from legacy "content" column if present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'content'
  ) then
    update public.messages
    set body = coalesce(body, content)
    where body is null;
  end if;
end $$;

-- Keep legacy "content" column in sync and remove strict constraints if it exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'content'
  ) then
    update public.messages
    set content = coalesce(content, body, '')
    where content is null;

    alter table public.messages
    alter column content set default '',
    alter column content drop not null;
  end if;
end $$;

update public.messages
set body = ''
where body is null;

alter table if exists public.messages
alter column body set not null;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  template_type text not null,
  content text not null,
  is_automated boolean not null default false,
  send_hours_before integer,
  access_type text,
  access_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host_id, template_type)
);

create index if not exists conversations_guest_id_idx on public.conversations (guest_id);
create index if not exists conversations_host_id_idx on public.conversations (host_id);
create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc);
create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id, read_at);
create index if not exists message_templates_host_id_idx on public.message_templates (host_id);
