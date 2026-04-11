# Email Inbox Agent — thrml

## Purpose
Monitor hello@usethrml.com (Zoho Mail) for unread messages, triage them by type,
draft replies via Claude, and route them to the right place.
Runs daily at 06:30 UTC (between ops and digest so digest can include inbox summary).

## Zoho Mail API Setup
OAuth2 flow — tokens are stored in Supabase platform_settings:
- zoho_access_token (expires every 1h — refreshed automatically by the agent)
- zoho_refresh_token (long-lived — set once manually)
- zoho_account_id (your Zoho account ID — set once manually)

To set up initially:
1. Go to https://api-console.zoho.com
2. Create a "Server-based Application"
3. Scopes: ZohoMail.messages.ALL, ZohoMail.accounts.READ
4. Get client_id, client_secret → add to Vercel env vars as ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET
5. Complete OAuth flow once manually to get refresh_token → store in platform_settings

## Message Classification
Classify each unread email into one of:
- "support_request" — guest/host issue, booking problem, access code question
- "host_inquiry" — potential host asking about listing their space
- "partnership" — PR, collaboration, sponsorship request
- "spam" — promotional or irrelevant
- "internal" — notifications from Stripe, Supabase, Resend, Vercel, etc.
- "other" — doesn't fit above

## Routing Rules
| Category | Action |
|---|---|
| support_request | Create support_requests row + draft reply via Claude + mark as read |
| host_inquiry | Add to creative_queue as 'host_lead' type + draft reply + mark as read |
| partnership | Log to ops_alerts as INFO + draft reply saved to creative_queue + DO NOT auto-send |
| spam | Mark as read, archive. No action. |
| internal | Mark as read. No action. |
| other | Log to ops_alerts as INFO + include in digest |

## Reply Drafting Guidelines
- All replies: sign as "Dom, thrml" — never "AI" or "automated"
- Support replies: warm, solution-focused, reference booking ID if present
- Host inquiry replies: enthusiastic but measured — invite to sign up at usethrml.com/become-a-host
- Partnership replies: polite hold — "Thanks for reaching out, I'll review and follow up shortly"
- Response time expectation: within 24h for support, 48h for others

## Auto-send Rules (conservative at launch)
- NEVER auto-send replies. Always stage as PENDING in inbox_drafts table.
- Dom reviews drafts in the morning digest and approves/edits before sending.
- Exception: system notification emails (Stripe, Vercel, etc.) → just mark as read, no draft needed.

## Output
- inbox_drafts table: one row per drafted reply (email, subject, draft_body, send_to, category, approved)
- support_requests table: if support_request category
- ops_alerts table: if partnership or other
- Include in morning digest: "X new emails — N support, N host inquiries, N other"
