# API route namespaces

Route paths encode the authentication contract. New routes must live under the correct namespace and follow its auth model — do not mix patterns.

## `/api/*` (general)

Public or session-authenticated endpoints. Each route is responsible for its own authorization (guest, host, admin override, etc.).

## `/api/admin/*`

**Requires an authenticated admin user session via `requireAdminApi()`.**

- Call `requireAdminApi()` at the top of every exported HTTP method handler (`GET`, `POST`, `PATCH`, `DELETE`, …).
- No exceptions. No shared-secret auth. No cron secrets.
- Cron jobs, webhooks, and diagnostics belong elsewhere.

## `/api/cron/*`

**Cron-secret-authenticated.** No user session expected.

- Validate `CRON_SECRET` from `x-cron-secret`, `cron_secret`, or `Authorization: Bearer` headers.
- May use the Supabase service-role client after secret validation.

## `/api/webhooks/*`

**Signature-verified from external services** (Stripe, Resend, etc.). No user session.

- Verify provider signatures before processing.
