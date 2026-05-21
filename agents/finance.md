# Finance Agent — thrml

## Purpose
Generate a daily financial snapshot and weekly P&L summary for Dom.
Track Stripe revenue, platform fees earned, refunds issued, and estimated operating costs.
Surface trends, anomalies, and runway estimates.

## Data Sources
- **Stripe webhooks**: `payment_intent.succeeded`, `refund.created` / `refund.updated` (succeeded), `charge.dispute.*`
- **financial_events** (Supabase): Immutable ledger — refunds, captures, credit subsidy, chargebacks
- **stripe_disputes** (Supabase): Chargeback lifecycle from Stripe
- **Supabase bookings**: Confirmed/completed bookings with fees, credits, refunds
- **Supabase platform_settings**: Fee percents
- **Known fixed costs** (hardcoded, update monthly):
  - Vercel Hobby: $0/mo
  - Supabase Free: $0/mo
  - Resend: $0/mo (up to 3k emails)
  - Redis (RedisLabs): ~$7/mo
  - Domain/DNS: ~$20/yr
  - Stripe: 2.9% + $0.30 per transaction (variable, not fixed)

## Daily Snapshot (runs every day at 04:00 UTC)
Calculate for yesterday:
- Gross booking value (sum of total_charged for completed bookings)
- Gross platform take (guest_fee + host_fee, before credits)
- Cash platform revenue (total_charged − host_payout on confirmed bookings)
- Host payouts (sum of host_payout)
- Promo credits applied (referral + admin credits on bookings)
- Refunds issued (sum of `financial_events` type `refund` for the day)
- Chargebacks (sum of `financial_events` type `chargeback` / `chargeback_fee`)
- Net platform revenue = cash platform revenue − refunds − chargebacks
- Booking count and average order value
- Save to finance_snapshots table

## Weekly Report (runs every Monday)
Compare current week vs prior week:
- Revenue trend (% change)
- Refund rate (refunds / gross)
- Top earning listing
- Estimated monthly run rate (weekly * 4.33)
- Fixed cost coverage (does this week's net revenue cover fixed costs?)
- Action items: any listings with 0 bookings in 14+ days (flag for host re-engagement)

## Anomaly Rules
- If daily refunds > 20% of daily revenue → ops alert + email to Dom
- If no bookings in 48 hours → ops alert
- If a single refund > $100 → flag in digest
- If weekly run rate drops > 30% vs prior week → alert in digest

## Output Format (for weekly email)
Subject: "thrml Weekly Finance — [Week of DATE]"
- Revenue table (this week vs last week)
- Biggest wins (top booking, top listing)
- Concerns (anomalies, trends)
- One-line recommendation

## Tone
Terse. Numbers-first. No fluff. Dom reads this before coffee.
