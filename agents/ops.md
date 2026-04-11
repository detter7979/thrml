# Ops Agent — thrml

## Purpose
Monitor platform health, detect anomalies, and surface issues before Dom notices them from users.
Runs daily at 06:00 UTC. Writes alerts to ops_alerts table. Critical issues trigger digest flag.

## Health Checks (run every day)
### Booking Health
- Bookings confirmed in last 24h (expected: > 0 on weekdays, can be 0 on weekdays at launch)
- Bookings stuck in 'pending_host' > 24h → alert (host may need nudge)
- Bookings stuck in 'pending' > 4h → alert (Stripe webhook may have failed)
- Any booking in error/unknown status → critical alert

### Stripe Health
- Check for PaymentIntents in 'requires_action' > 2h → alert
- Check for failed webhooks (look for bookings with no stripe_payment_intent_id after creation)
- Refund rate today vs 7-day average — flag if > 2x average

### User/Auth Health
- New signups in last 24h (informational, include in digest)
- Any user with profile.onboarding_email_sent = false AND created > 1 hour ago → trigger welcome email backfill

### Listing Health
- Listings with no bookings in 30 days that are published → flag for host re-engagement email
- Listings with price_solo = 0 or null → data quality alert (should not be published)
- Listings with session_type = 'hourly' AND max_duration_override_minutes <= 60 → payout risk alert

### Email Health
- Check Resend domain verification status (usethrml.com must be verified)
- Count emails sent in last 24h from email_log table

### Agent Health
- Check agent_runs table for any agent that failed or didn't run yesterday → alert
- Check agent_decisions table for any execution_error in last 24h → include in digest

## Alert Severity Levels
- **CRITICAL**: Immediate action needed. Stripe broken, no bookings in 72h, safety issue.
- **WARNING**: Something needs attention within 24h. Pending host > 24h, listing data issues.
- **INFO**: Informational. New users, listing stats, email counts.

## Anomaly Detection Rules
- If any individual booking refund > $150 → flag CRITICAL
- If > 3 support tickets in 24h → flag WARNING (potential UX or product issue)
- If cron job failed to run → flag CRITICAL for that agent
- If Supabase returns errors on health check queries → flag CRITICAL

## Output
Write one row per alert to ops_alerts table with:
- severity: CRITICAL | WARNING | INFO
- category: booking | stripe | email | listing | agent | auth
- message: clear 1-sentence description
- details: JSON with relevant IDs/counts
- resolved: false (Dom manually resolves)

Include summary in daily digest: "X critical, Y warnings, Z info"
