import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

type MetaEventsPayload = {
  eventName?: string
  eventId?: string
  eventSourceUrl?: string
  customData?: Record<string, unknown>
  userData?: {
    email?: string
    firstName?: string
    lastName?: string
    fbp?: string
    fbc?: string
  }
}

function normalizeForHash(value: string) {
  return value.trim().toLowerCase()
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function hashIfPresent(value?: string) {
  if (!value) return undefined
  const normalized = normalizeForHash(value)
  if (!normalized) return undefined
  return /^[a-f0-9]{64}$/i.test(normalized) ? normalized : sha256(normalized)
}

export async function POST(req: NextRequest) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN
  if (!pixelId || !accessToken) {
    console.warn("[Meta CAPI] Missing NEXT_PUBLIC_META_PIXEL_ID or META_CONVERSIONS_API_TOKEN")
    return NextResponse.json({ ok: false, skipped: true }, { status: 202 })
  }

  let payload: MetaEventsPayload
  try {
    payload = (await req.json()) as MetaEventsPayload
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  if (!payload.eventName) {
    return NextResponse.json({ ok: false, error: "eventName is required" }, { status: 400 })
  }

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const userAgent = req.headers.get("user-agent") ?? undefined

  const userData = {
    ...(hashIfPresent(payload.userData?.email) ? { em: hashIfPresent(payload.userData?.email) } : {}),
    ...(hashIfPresent(payload.userData?.firstName) ? { fn: hashIfPresent(payload.userData?.firstName) } : {}),
    ...(hashIfPresent(payload.userData?.lastName) ? { ln: hashIfPresent(payload.userData?.lastName) } : {}),
    ...(payload.userData?.fbp ? { fbp: payload.userData.fbp } : {}),
    ...(payload.userData?.fbc ? { fbc: payload.userData.fbc } : {}),
    ...(forwardedFor ? { client_ip_address: forwardedFor } : {}),
    ...(userAgent ? { client_user_agent: userAgent } : {}),
  }

  const requestBody = {
    data: [
      {
        event_name: payload.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: payload.eventSourceUrl ?? req.headers.get("referer") ?? undefined,
        event_id: payload.eventId,
        custom_data: payload.customData ?? {},
        user_data: userData,
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      const details = await response.text()
      console.error("[Meta CAPI] Request failed", response.status, details)
    }
  } catch (error) {
    console.error("[Meta CAPI] Send failed", error)
  }

  return NextResponse.json({ ok: true })
}
