import { hashIfPresent } from "@/lib/analytics/hash-for-meta"

const GRAPH_VERSION = "v21.0"

function pixelId(): string {
  const pid = process.env.META_PIXEL_ID ?? process.env.NEXT_PUBLIC_META_PIXEL_ID
  if (!pid) {
    throw new Error("NEXT_PUBLIC_META_PIXEL_ID env var is required (or META_PIXEL_ID)")
  }
  return pid
}

function capiAccessToken(): string {
  const token =
    process.env.META_CAPI_ACCESS_TOKEN ?? process.env.META_CONVERSIONS_API_TOKEN
  if (!token) {
    throw new Error(
      "META_CONVERSIONS_API_TOKEN env var is required (or META_CAPI_ACCESS_TOKEN)"
    )
  }
  return token
}

export type MetaCapiUserData = {
  email?: string
  phone?: string
  externalId?: string
}

/**
 * Server-side Meta Conversions API. Hashes email / external_id per Meta requirements.
 */
export async function fireServerEvent(
  eventName: string,
  userData: MetaCapiUserData,
  customData?: Record<string, unknown>,
  options?: { eventId?: string; eventSourceUrl?: string }
): Promise<void> {
  const pid = pixelId()
  const token = capiAccessToken()

  const em = hashIfPresent(userData.email)
  const ph = hashIfPresent(userData.phone?.replace(/\D/g, ""))
  const external_id = hashIfPresent(userData.externalId)

  const user_data: Record<string, unknown> = {}
  if (em) user_data.em = em
  if (ph) user_data.ph = ph
  if (external_id) user_data.external_id = external_id

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        ...(options?.eventId ? { event_id: options.eventId } : {}),
        ...(options?.eventSourceUrl ? { event_source_url: options.eventSourceUrl } : {}),
        user_data,
        ...(customData && Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
      },
    ],
  }
  if (process.env.META_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_TEST_EVENT_CODE
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      const t = await res.text()
      console.error("[meta-capi] Request failed", res.status, t.slice(0, 500))
    }
  } catch (e) {
    console.error("[meta-capi] Send failed", e)
  }
}
