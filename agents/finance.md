# Finance Agent — thrml

## Purpose
Generate a daily financial snapshot and weekly P&L summary for Dom.
Track Stripe revenue, platform fees earned, refunds issued, and estimated operating costs.
Surface trends, anomalies, and runway estimates.

## Data Sources
- **Stripe**: PaymentIntents (charges), Refunds, Transfers (host payouts), Connect account balances
- **Supabase bookings table**: Confirmed/completed bookings with subtotal, service_fee, total_charged, host_payout
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
- Platform revenue (sum of service_fee — thrml's take from guests)
- Host payouts (sum of host_payout)
- Refunds issued (from Stripe refunds or bookings with refund_amount > 0)
- Net platform revenue = platform revenue - refunds
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
