-- Thrml account credits (admin grants) + immutable ledger
-- balance is stored in minor units (cents) for USD.

create table if not exists public.user_credits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  currency text not null default 'usd',
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount bigint not null,
  type text not null check (type in ('grant', 'spend', 'refund')),
  description text not null default '',
  stripe_invoice_id text,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create unique index if not exists credit_ledger_one_spend_per_booking
  on public.credit_ledger (booking_id)
  where type = 'spend' and booking_id is not null;

alter table public.bookings
  add column if not exists user_credit_applied_cents integer not null default 0;

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;

create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

create policy "credit_ledger_select_own"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

-- Atomic grant: increases balance and records ledger (positive amount).
create or replace function public.grant_user_credit (
  p_user_id uuid,
  p_amount_cents bigint,
  p_description text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'grant amount must be positive';
  end if;

  insert into public.user_credits (user_id, balance, currency)
  values (p_user_id, p_amount_cents, 'usd')
  on conflict (user_id) do update
    set balance = public.user_credits.balance + p_amount_cents,
        updated_at = now();

  insert into public.credit_ledger (user_id, amount, type, description)
  values (p_user_id, p_amount_cents, 'grant', coalesce(nullif(trim(p_description), ''), 'Credit granted'));
end;
$$;

-- Atomic spend for a booking; idempotent per booking_id (second call is no-op).
-- Ledger spend rows use negative amounts.
create or replace function public.apply_credits_to_booking (
  p_user_id uuid,
  p_amount_cents bigint,
  p_booking_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_new_balance bigint;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_id_required');
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  select cl.id into v_existing
  from public.credit_ledger cl
  where cl.booking_id = p_booking_id
    and cl.type = 'spend'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  insert into public.user_credits (user_id, balance, currency)
  values (p_user_id, 0, 'usd')
  on conflict (user_id) do nothing;

  update public.user_credits uc
  set balance = uc.balance - p_amount_cents,
      updated_at = now()
  where uc.user_id = p_user_id
    and uc.balance >= p_amount_cents
  returning uc.balance into v_new_balance;

  if v_new_balance is null then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits');
  end if;

  insert into public.credit_ledger (user_id, amount, type, description, booking_id)
  values (
    p_user_id,
    -p_amount_cents,
    'spend',
    'Applied to booking',
    p_booking_id
  );

  return jsonb_build_object('ok', true, 'balance_after', v_new_balance);
end;
$$;

grant execute on function public.grant_user_credit (uuid, bigint, text) to service_role;
grant execute on function public.apply_credits_to_booking (uuid, bigint, uuid) to service_role;
