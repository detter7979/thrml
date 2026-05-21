-- Financial ledger: immutable events, Stripe disputes, daily snapshots, promo credit restore.

-- ---------------------------------------------------------------------------
-- financial_events (append-only audit trail)
-- amount_cents: signed from platform perspective (+ inflow, − outflow / expense)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_events (
  id uuid primary key default gen_random_uuid (),
  event_type text not null check (
    event_type in (
      'booking_capture',
      'refund',
      'credit_subsidy',
      'referral_credit_restore',
      'user_credit_restore',
      'chargeback',
      'chargeback_fee',
      'chargeback_reversal',
      'stripe_fee'
    )
  ),
  amount_cents bigint not null,
  currency text not null default 'usd',
  booking_id uuid references public.bookings (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  stripe_event_id text,
  stripe_object_id text,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists financial_events_stripe_object_uidx
  on public.financial_events (event_type, stripe_object_id)
  where stripe_object_id is not null;

create unique index if not exists financial_events_booking_restore_uidx
  on public.financial_events (booking_id, event_type)
  where booking_id is not null
    and event_type in ('referral_credit_restore', 'user_credit_restore');

create index if not exists financial_events_occurred_at_idx
  on public.financial_events (occurred_at desc);

create index if not exists financial_events_booking_idx
  on public.financial_events (booking_id)
  where booking_id is not null;

alter table public.financial_events enable row level security;

-- ---------------------------------------------------------------------------
-- stripe_disputes (chargebacks from Stripe webhooks)
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_disputes (
  id uuid primary key default gen_random_uuid (),
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  booking_id uuid references public.bookings (id) on delete set null,
  amount_cents bigint not null,
  currency text not null default 'usd',
  status text not null,
  reason text,
  stripe_fee_cents bigint,
  raw_event jsonb,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_disputes_booking_idx
  on public.stripe_disputes (booking_id)
  where booking_id is not null;

create index if not exists stripe_disputes_status_idx
  on public.stripe_disputes (status);

alter table public.stripe_disputes enable row level security;

-- ---------------------------------------------------------------------------
-- finance_snapshots (daily rollup; create if missing from manual/agent DDL)
-- ---------------------------------------------------------------------------
create table if not exists public.finance_snapshots (
  snapshot_date date primary key,
  booking_count integer not null default 0,
  gross_booking_value numeric(12, 2) not null default 0,
  platform_revenue numeric(12, 2) not null default 0,
  host_payouts numeric(12, 2) not null default 0,
  refunds_issued numeric(12, 2) not null default 0,
  net_platform_revenue numeric(12, 2) not null default 0,
  avg_order_value numeric(12, 2) not null default 0,
  new_users integer not null default 0,
  new_listings integer not null default 0
);

alter table public.finance_snapshots
  add column if not exists credits_applied numeric(12, 2) not null default 0;

alter table public.finance_snapshots
  add column if not exists chargebacks numeric(12, 2) not null default 0;

alter table public.finance_snapshots
  add column if not exists gross_platform_take numeric(12, 2) not null default 0;

comment on column public.finance_snapshots.credits_applied is
  'Promo subsidy (referral + admin credits applied to bookings that day).';

comment on column public.finance_snapshots.gross_platform_take is
  'Guest + host fees before credits (subtotal-based take).';

-- ---------------------------------------------------------------------------
-- credit_ledger: one restore row per booking
-- ---------------------------------------------------------------------------
create unique index if not exists credit_ledger_one_refund_per_booking
  on public.credit_ledger (booking_id)
  where type = 'refund' and booking_id is not null;

-- ---------------------------------------------------------------------------
-- Restore referral + admin credits after refund/cancel (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.restore_booking_promo_credits (p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_referral_cents integer;
  v_user_cents integer;
  v_restored_referral integer := 0;
  v_restored_user integer := 0;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_id_required');
  end if;

  select
    b.id,
    b.guest_id,
    coalesce(b.referral_credit_applied_cents, 0) as referral_credit_applied_cents,
    coalesce(b.user_credit_applied_cents, 0) as user_credit_applied_cents
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  v_referral_cents := greatest(0, v_booking.referral_credit_applied_cents);
  v_user_cents := greatest(0, v_booking.user_credit_applied_cents);

  if v_referral_cents > 0
     and not exists (
    select 1
    from public.financial_events fe
    where fe.booking_id = p_booking_id
      and fe.event_type = 'referral_credit_restore'
  ) then
    update public.profiles
    set referral_credit_cents = coalesce(referral_credit_cents, 0) + v_referral_cents
    where id = v_booking.guest_id;

    insert into public.financial_events (
      event_type,
      amount_cents,
      booking_id,
      user_id,
      source,
      metadata,
      occurred_at
    )
    values (
      'referral_credit_restore',
      v_referral_cents,
      p_booking_id,
      v_booking.guest_id,
      'restore_booking_promo_credits',
      jsonb_build_object('referral_cents', v_referral_cents),
      now()
    );

    v_restored_referral := v_referral_cents;
  end if;

  if v_user_cents > 0
     and exists (
    select 1
    from public.credit_ledger cl
    where cl.booking_id = p_booking_id
      and cl.type = 'spend'
  )
  and not exists (
    select 1
    from public.credit_ledger cl
    where cl.booking_id = p_booking_id
      and cl.type = 'refund'
  )
  and not exists (
    select 1
    from public.financial_events fe
    where fe.booking_id = p_booking_id
      and fe.event_type = 'user_credit_restore'
  ) then
    insert into public.user_credits (user_id, balance, currency)
    values (v_booking.guest_id, 0, 'usd')
    on conflict (user_id) do nothing;

    update public.user_credits uc
    set balance = uc.balance + v_user_cents,
        updated_at = now()
    where uc.user_id = v_booking.guest_id;

    insert into public.credit_ledger (user_id, amount, type, description, booking_id)
    values (
      v_booking.guest_id,
      v_user_cents,
      'refund',
      'Restored after booking refund/cancel',
      p_booking_id
    );

    insert into public.financial_events (
      event_type,
      amount_cents,
      booking_id,
      user_id,
      source,
      metadata,
      occurred_at
    )
    values (
      'user_credit_restore',
      v_user_cents,
      p_booking_id,
      v_booking.guest_id,
      'restore_booking_promo_credits',
      jsonb_build_object('user_credit_cents', v_user_cents),
      now()
    );

    v_restored_user := v_user_cents;
  end if;

  return jsonb_build_object(
    'ok', true,
    'referral_restored_cents', v_restored_referral,
    'user_credit_restored_cents', v_restored_user
  );
end;
$$;

grant execute on function public.restore_booking_promo_credits (uuid) to service_role;
