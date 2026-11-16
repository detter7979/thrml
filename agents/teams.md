# thrml teams

Names are labels. Membership is the contract. Renaming a team does not change a route.

Executors stay the cron routes in `vercel.json` and the code under `src/lib/agent/`. A team may draft, report, or recommend. It does not get its own Stripe, Meta, or email credentials.

Escalation rules in `agents/AGENT-OS.md` apply to every team.

## Front Desk

Guest and host care. Drafts and classifications. Sends only inside the auto-send rules already in `agents/email-inbox.md`.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| inbox | `email-inbox.md` | `/api/cron/agent-inbox` | 06:30 daily | `agent_runs.inbox` |
| disputes | — | `/api/cron/agent-disputes` | 03:00 daily | `agent_runs.disputes` |
| reminders | — | `/api/cron/reminders` | 08:00 daily | deterministic |
| send-messages | — | `/api/cron/send-messages` | 09:00 daily | deterministic |
| review-requests | — | `/api/cron/review-requests` | 12:00 daily | deterministic |
| retarget | — | `/api/cron/retarget` | 14:00 daily | deterministic |
| lifecycle | — | `/api/cron/lifecycle` | 15:00 daily | deterministic |
| newsletter | — | `/api/cron/newsletter-biweekly` | 16:00 Wednesday | deterministic |

## Ledger

Money snapshots and paid-media reporting. Reports only.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| finance | `finance.md` | `/api/cron/agent-finance` | 04:00 daily | `agent_runs.finance` |
| reporting | `reporting.md` | `/api/cron/agent-reporting` | 09:30 daily | `agent_runs.reporting` |
| reporting-ingest | `reporting.md` | `/api/cron/reporting-agent` | 09:05 daily | `actions_log` |
| monthly-reconciliation | — | `/api/cron/monthly-reconciliation` | 08:15 on the 1st | deterministic |

## House

Platform health, the morning email, and data sync. The digest email is a template. Grok does not write that email.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| ops | `ops.md` | `/api/cron/agent-ops` | 06:00 daily | `agent_runs.ops` |
| digest | — | `/api/cron/agent-digest` | 07:00 daily | `agent_runs.digest` |
| gdrive | — | `/api/cron/agent-gdrive` | 04:30 daily | `agent_runs.gdrive-sync` |
| sync-ga4 | — | `/api/cron/sync-ga4` | 02:00 daily | deterministic |
| sync-google-ads | — | `/api/cron/sync-google-ads` | 02:05 daily | deterministic |
| sync-meta | — | `/api/cron/sync-meta` | 02:00 daily | deterministic |
| sync-bookings | — | `/api/cron/sync-bookings` | 02:00 daily | deterministic |
| expire-booked-slots | — | `/api/cron/expire-booked-slots` | 10:00 daily | deterministic |
| anonymize-deleted-accounts | — | `/api/cron/anonymize-deleted-accounts` | 01:00 daily | deterministic |

### Digest shadow

`AGENT_SHADOW_DIGEST=1` asks AI Gateway for a short summary of the same facts the template email already used. The summary is stored on `agent_runs.results.shadow`. It is not copied into the email.

Leave the flag unset until both of these are set in the Vercel project:

- `AGENT_SHADOW_MODEL` — a text model id from `GET https://ai-gateway.vercel.sh/v1/models`
- `AI_GATEWAY_API_KEY`, or a Vercel deployment where `VERCEL_OIDC_TOKEN` is present

Checked against the live catalog on 15 Nov 2026: `spacexai/grok-4.20-non-reasoning` is a short-summary model. Re-check the catalog before relying on that id. If the flag is on and the model or credentials are missing, the run records `shadow.status = "skipped"` and the email still sends.

### Skill pipe

Social posts (`social`), creative briefs (`creative`), inbox classification (`email-inbox`), and dispute classification (`disputes`) still call Claude. Two lists decide what happens next. Leave both empty until a digest shadow has been compared.

- `AGENT_SHADOW_SKILLS` — comma-separated skill names, or `*`. Each listed skill keeps acting on the Claude reply. A Grok reading is stored as its own `agent_runs` row named `shadow:<skill>`.
- `AGENT_LIVE_SKILLS` — same shape. A listed skill acts on the Grok reply instead of Claude. If the gateway call fails, that skill uses Claude for that run.

Both lists use `AGENT_SHADOW_MODEL` and the gateway credential already used by the digest. Finance, ops, reporting, and the digest email do not call Claude, so they are not on either list.

## Studio

Creative production. Briefs and the content queue. Publishing stays behind the current approval status.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| social | `social.md` | `/api/cron/agent-social` | 05:00 daily | `agent_runs.social` |
| social-publish | `social-publish.md` | `/api/cron/agent-social-publish` | 08:30 daily | `agent_runs.social-publish` |
| creative-brief | `creative.md` | `/api/cron/agent-creative-brief` | 08:00 daily | `agent_runs.creative-brief` |
| creative-static | `creative.md` | `/api/cron/agent-creative-static` | 09:00 daily | `agent_runs.creative-static` |

Reference files, not jobs: `brand.md`, `brand_voice.md`, `design.md`, `visual_style.md`.

`/api/cron/agent-creative-generate` (`agent_runs.creative-generate`) exists and is not in `vercel.json`. It stays off this schedule until a team promotion says otherwise.

## Floor

Paid media. Recommendations only. Budget changes, pauses, and launches stay on the recommendation contract in `contracts/agent_contracts_v1.json`.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| ads-evaluate | `paid-ads.md` | `/api/cron/agent-evaluate` | not scheduled | `agent_runs.ads-evaluate` |
| evaluator | `paid-ads.md` | `/api/cron/evaluator-agent` | 10:00 daily | `actions_log` |
| meta-ads | `paid-ads.md` | `/api/cron/meta-ads-agent` | 11:00 daily | `actions_log` |
| namer-sync | — | `/api/cron/namer-sync` | 12:00 daily | deterministic |

## Scout

Notes on a cadence. No writes to campaigns or listings.

| Job | Skill | Route | Schedule (UTC) | Run log |
|---|---|---|---|---|
| research | `research.md` | — | not scheduled | — |
