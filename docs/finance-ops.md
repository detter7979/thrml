# Finance operations

## If scripts report missing tables/RPC

Re-run `supabase/migrations/20260524120000_financial_ledger.sql` in the Supabase SQL editor, then refresh the API schema cache:

```sql
NOTIFY pgrst, 'reload schema';
```

Wait ~30 seconds and re-run `npm run finance:smoke`.

## After backfill (`financial_events`)

Rebuild daily rollup rows, then push to the Finance Tracker sheet:

```bash
npm run finance:rebuild-snapshots -- --dry-run
npm run finance:rebuild-snapshots
npm run finance:sync-sheet
```

`finance:sync-sheet` writes **Marketplace Data** from `finance_snapshots`, copies **Platform Data** from the Master Report (when `gdrive_master_report_id` is set), and rebuilds **P&L Dashboard** + **Executive Summary** with date-filtered formulas.

To rebuild sheet tabs only (no snapshot sync):

```bash
npm run finance:rebuild-sheet
```

### Sheet layout

| Tab | Role |
|-----|------|
| **Marketplace Data** | Daily GMV, fees, refunds, net rev (from Supabase) |
| **Platform Data** | Paid media rows; spend in col **AB**, date in col **A** |
| **Fixed Costs** | Recurring monthly amounts in col **C** |
| **Ad Hoc Costs** | One-off costs; date col **A**, amount col **D** |
| **P&L Dashboard** | Calculation layer: MTD, last 30/90 days, YTD, % of GMV |
| **Executive Summary** | Readable view; references P&L Dashboard cells |

To auto-sync after the nightly gdrive cron, store the Finance Tracker sheet ID:

```sql
INSERT INTO platform_settings (key, value)
VALUES ('gdrive_finance_tracker_sheet_id', '"1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Optional env override: `FINANCE_TRACKER_SHEET_ID`

## Quick checks

```bash
# Verify tables, RPC, recent ledger rows, liabilities
npm run finance:smoke

# Compare bookings vs financial_events
npm run finance:reconcile

# Backfill historical captures/refunds (preview first)
npm run finance:backfill -- --dry-run
npm run finance:backfill
```

Or in the browser (admin session): `GET /api/admin/finance/health`

## After migration + webhook setup

1. **Backfill** past bookings so the ledger matches history.
2. **Reconcile** — should report zero missing captures when done.
3. **Confirm a new booking** — you should see `booking_capture` and, if credits used, `credit_subsidy` in `financial_events`.
4. **Test a refund** — `refund` event + promo credits restored on the guest profile.

## Stripe webhook events

Ensure these are enabled on your endpoint:

- `payment_intent.succeeded`
- `refund.created`, `refund.updated`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`

## Daily rollup

`agent-finance` cron writes `finance_snapshots` and syncs to Google Sheets via `agent-gdrive`.

| Column | Meaning |
|--------|---------|
| `gross_booking_value` | Sum of `total_charged` (guest cash) |
| `gross_platform_take` | Guest + host fees before credits |
| `platform_revenue` | Cash take (`total_charged − host_payout`) |
| `credits_applied` | Referral + admin credits subsidized |
| `refunds_issued` | From `financial_events` on refund date |
| `chargebacks` | From dispute events |
| `net_platform_revenue` | Cash take − refunds − chargebacks |

## Admin earnings report

`/admin/earnings` shows gross vs cash platform take, promo credits, and refunds for the filtered period.

## Not yet automated

- Stripe processing fees per transaction
- Connect transfer reversal policy on partial refunds
- Host cancellation penalties (tracked in `host_cancellations`, not charged)
