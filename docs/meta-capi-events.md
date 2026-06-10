# Meta Conversions API — Host Acquisition Events

Server module: `src/lib/meta-capi.ts`  
Host helpers: `src/lib/meta/host-acquisition-events.ts`  
Client Pixel: `src/components/meta-pixel.tsx` (`trackMetaEvent`)

All PII in `user_data` is SHA-256 hashed before send. Raw email/phone/name never leave the server.

## Host funnel (P1 → P3)

| Phase | Meta custom event | Namer Opt. Event | Primary trigger |
|-------|-------------------|------------------|-----------------|
| P1 | `become_host_click` | `become_host_click` | Client click → `/become-a-host` |
| P2 | `host_onboarding_started` | `host_onboarding_started` | First load of `/dashboard/host/new` |
| P3 (optimize) | `host_first_listing_created` | `host_first_listing_created` | First successful `POST /api/listings` |
| Funnel (all listings) | `host_listing_created` | `host_listing_created` | Every successful `POST /api/listings` |

Legacy alias `listing_created` still maps to NL in reporting ingest for older campaigns.

**Namer sheet:** Opt. Event dropdowns include all events above. P3 host campaigns/ad sets/ads use `host_first_listing_created`. Re-apply validation with `node scripts/fix-namer-validation.mjs` after deploy.

---

## `host_onboarding_started`

**Where it fires:** `/dashboard/host/new` — first authenticated visit after completing host terms on `/become-a-host` (step 3). This is the server-side moment the user commits to creating a listing, not a URL pattern like `?create=1`.

**Files:**
- Client Pixel: `host-new-listing-client.tsx` (`useEffect` on mount)
- Server: `POST /api/events/host-onboarding-started` → `maybeFireHostOnboardingStarted()`
- Idempotency: `profiles.host_onboarding_started_at` (migration `20260602140000_profiles_host_onboarding_started_at.sql`)

**Pixel ↔ CAPI dedup:** Client generates `event_id` (UUID), passes to `fbq('trackCustom', …, { eventID })` and the server route with the same id.

### `user_data` populated

| Field | Source |
|-------|--------|
| `em` | `user.email` (hashed) |
| `fn` / `ln` | `profiles.first_name` / `last_name`, or split from `full_name` |
| `external_id` | `user.id` (hashed) |
| `client_ip_address` | `x-forwarded-for` → `x-real-ip` |
| `client_user_agent` | Request `user-agent` |
| `fbp` | `_fbp` cookie (from client body) |
| `fbc` | `_fbc` cookie or constructed from `fbclid` |

### Intentionally omitted

| Field | Reason |
|-------|--------|
| `ph` | Phone not collected before listing wizard |

### Example CAPI payload (redacted)

```json
{
  "test_event_code": "TEST12345",
  "data": [
    {
      "event_name": "host_onboarding_started",
      "event_time": 1748870400,
      "event_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "action_source": "website",
      "event_source_url": "https://usethrml.com/dashboard/host/new",
      "user_data": {
        "em": "7c4a8d09ca3762af61e59520943dc26494f8941b",
        "fn": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5d86dfa6ee59d7c7c6db5648e",
        "ln": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
        "external_id": "2c26b46b68ffc68ff949b4e7d7e8fb79222c3159eeb0c574b23757849d958e1",
        "client_ip_address": "203.0.113.42",
        "client_user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "fbp": "fb.1.1748870300.1234567890",
        "fbc": "fb.1.1748870200.IwAR0example"
      },
      "custom_data": {
        "content_name": "Host Onboarding"
      }
    }
  ]
}
```

---

## `host_first_listing_created` + `host_listing_created`

**Where they fire:** `POST /api/listings` immediately after successful insert.

**Logic:**
```ts
const { count } = await admin.from("listings").select("id", { count: "exact", head: true }).eq("host_id", user.id)
if (count === 1) fireCapiEvent("host_first_listing_created", …)
fireCapiEvent("host_listing_created", …)
```

**Pixel ↔ CAPI dedup (create wizard):** Server generates event IDs in `POST /api/listings` response (`meta.host_listing_created_event_id`, `meta.host_first_listing_created_event_id`). Client calls `trackHostListingPublishedMeta({ …, sendServer: false })` so Pixel uses the same IDs without a second CAPI call.

**Draft publish path:** `edit-listing-client.tsx` → `trackHostListingPublishedMeta` with `sendServer: true` → `POST /api/events/listing-created` (no duplicate from create route).

### `user_data` populated

Same as onboarding, plus phone when present on `profiles.phone`.

### Intentionally omitted

| Field | Reason |
|-------|--------|
| `ph` | Usually absent until profile completion |

### Example: `host_first_listing_created` (redacted)

```json
{
  "data": [
    {
      "event_name": "host_first_listing_created",
      "event_time": 1748874000,
      "event_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "action_source": "website",
      "event_source_url": "https://usethrml.com/dashboard/host/new",
      "user_data": {
        "em": "7c4a8d09ca3762af61e59520943dc26494f8941b",
        "fn": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5d86dfa6ee59d7c7c6db5648e",
        "ln": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
        "external_id": "2c26b46b68ffc68ff949b4e7d7e8fb79222c3159eeb0c574b23757849d958e1",
        "client_ip_address": "203.0.113.42",
        "client_user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "fbp": "fb.1.1748873900.9876543210"
      },
      "custom_data": {
        "content_id": "550e8400-e29b-41d4-a716-446655440000",
        "content_type": "product",
        "listing_id": "550e8400-e29b-41d4-a716-446655440000"
      }
    }
  ]
}
```

### Example: `host_listing_created` (second listing, redacted)

Same structure as above with `event_name: "host_listing_created"` and a different `event_id`. No `host_first_listing_created` event fires when `count > 1`.

---

## Operational notes

- **Async:** All CAPI calls are fire-and-forget; failures never block onboarding or listing publish.
- **Test events:** Set `META_TEST_EVENT_CODE` in env — included automatically in every payload.
- **Logging:** Success → `[CAPI] <event_name> sent { event_id, host_id?, listing_id? }`. Failure → full Meta error body.
- **Env:** `NEXT_PUBLIC_META_PIXEL_ID` (or `META_PIXEL_ID`), `META_CAPI_ACCESS_TOKEN` (or `META_CONVERSIONS_API_TOKEN`).

## Reporting mapping (`meta-ads-api.ts`)

| Meta event | Internal code | Master report column |
|------------|---------------|----------------------|
| `become_host_click` | BH | `become_host_click` |
| `host_onboarding_started` | HO | `host_onboarding_started` |
| `host_first_listing_created`, `listing_created` | NL | `listing_created` |
| `host_listing_created` | HLC | (funnel metric; not a P3 opt column) |
