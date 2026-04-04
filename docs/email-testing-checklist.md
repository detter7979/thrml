# Email testing checklist (Resend + Zoho)

Use this in **staging** first. In non-production, set `RESEND_TEST_TO_EMAIL` to your own inbox so transactional mail is not delivered to real users.

## 1. Environment and DNS

- [ ] `RESEND_API_KEY` is set (Vercel / local).
- [ ] Domain **usethrml.com** is verified in [Resend](https://resend.com/domains); **notifications@usethrml.com** is allowed as a sender (or you override with `RESEND_FROM_EMAIL`).
- [ ] Optional: `RESEND_FROM_EMAIL` matches what you verified in Resend.
- [ ] Optional: `RESEND_REPLY_TO` — default is `Thrml <hello@usethrml.com>` (Zoho). Use `__none__` only if you must omit `Reply-To`.
- [ ] Non-production: `RESEND_TEST_TO_EMAIL=you@example.com` so all `sendEmail` recipients in dev redirect safely (routes that branch on `NODE_ENV` still apply).
- [ ] `SUPPORT_EMAIL` set to **hello@usethrml.com** (or rely on production default: internal tickets go to hello@ if unset).
- [ ] **Supabase Auth** (Dashboard → Authentication → SMTP): configured with a verified sender (Zoho **hello@** or Resend **notifications@**). Send a **Reset password** from the login page and confirm delivery.

## 2. What to check on every message

For each test below, confirm:

- [ ] **From** is your transactional address (default `Thrml <notifications@usethrml.com>` unless overridden).
- [ ] **Reply-To** is `hello@usethrml.com` (or your override), except where noted.
- [ ] Links resolve to the expected host (`NEXT_PUBLIC_APP_URL` / production URL).
- [ ] Message appears in Resend **Logs** if delivery fails.

## 3. Guest onboarding (welcome)

**Route:** `POST /api/events/user-registered` (authenticated; idempotent via `profiles.onboarding_email_sent`).

**How to trigger**

- Sign in as a **guest** account with `onboarding_email_sent = false`, then from the same tab run:

```text
POST /api/events/user-registered
```

(with session cookies, e.g. from DevTools → Application → copy cookie header into curl, or a small “test” button in admin-only tooling).

- [ ] Subject matches guest welcome (`Welcome to Thrml — your first session awaits`).
- [ ] Footer includes **hello@usethrml.com** and explore / notification links.

**Note:** If this route is not yet called from the signup UI, manual POST is required until the client calls it after guest registration.

## 4. Host onboarding (welcome)

**Route:** `POST /api/events/host-onboarding-started` with JSON body `{ "event_id": "<unique-string>" }` (see `host-new-listing-client.tsx`). Idempotent with the same `onboarding_email_sent` flag.

**Prerequisite**

- [ ] `META_CONVERSIONS_API_TOKEN` and `NEXT_PUBLIC_META_PIXEL_ID` are configured — the handler currently **returns 202 before the email block** if the Meta token is missing, so the host welcome will not send in that case. For a pure email smoke test in staging, set the token or temporarily adjust the route so email still runs (see `src/app/api/events/host-onboarding-started/route.ts`).

**How to trigger**

- Open **Create listing** flow as a host; the client fires the event when appropriate, **or** call the route manually with a logged-in session and a fresh `event_id`.

- [ ] Subject: `Welcome to Thrml — let's get your space live`.
- [ ] CTA links to `/dashboard/account#house-rules` (Stripe / payouts).

## 5. Booking flow (core transactional)

Exercise through the real **book → pay → confirm** path (or host accept for request-to-book):

- [ ] Guest: confirmation / receipt style messages from `src/lib/emails.ts` (depending on instant vs request flow).
- [ ] Host: new booking / request notifications as applicable.
- [ ] Any **cancellation** path you use in QA triggers the right template and still uses notifications + Reply-To hello@.

Use a **Stripe test card** and a listing you control so you do not affect production guests.

## 6. Access code email

**Trigger:** Automated send when access-code rules are met (see `src/lib/access/send-access-code.ts` — typically near session time for compatible listings).

- [ ] Guest receives code / instructions; **From** and **Reply-To** match global defaults (no stray `RESEND_FROM_EMAIL`-only breakage).

## 7. Support form

**Path:** `/support` → submit a ticket.

- [ ] **Confirmation** email reaches the submitter (in prod: their address; in dev: `RESEND_TEST_TO_EMAIL` if that path applies).
- [ ] **Internal** alert reaches `SUPPORT_EMAIL` or **hello@usethrml.com** in production.
- [ ] Reply on the internal message: **Reply-To** should be the user’s email so you can answer from Zoho directly.

## 8. Newsletter welcome

**Path:** Homepage (or wherever) newsletter signup → `POST /api/newsletter/subscribe`.

- [ ] Welcome/template mail uses the same From / Reply-To conventions.

## 9. Dispute / agent resolution (if enabled)

When an automated resolution sends mail (`src/lib/disputes/executor.ts`):

- [ ] Resolution notice uses default From + Reply-To.

## 10. Retarget / cron (optional)

If you run `cron` routes that call `sendEmail`:

- [ ] Dry-run in staging with real `RESEND_API_KEY` and `RESEND_TEST_TO_EMAIL` before enabling production schedules.

---

## Quick reference (code)

| Area            | Primary entry |
|----------------|---------------|
| Send helper    | `src/lib/emails/send.ts` |
| Guest welcome  | `src/lib/emails/onboarding.ts` + `src/app/api/events/user-registered/route.ts` |
| Host welcome   | Same onboarding lib + `src/app/api/events/host-onboarding-started/route.ts` |
| Booking mail   | `src/lib/emails.ts`, webhooks / API routes that call it |
| Access code    | `src/lib/access/send-access-code.ts` |
| Support        | `src/app/api/support/route.ts` |
| Newsletter     | `src/app/api/newsletter/subscribe/route.ts` |

After each deploy, spot-check **Resend → Logs** and one **Zoho** inbox (**hello@**) for replies and support routing.
