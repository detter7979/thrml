import { NextRequest, NextResponse } from "next/server"

import { fireCapiEvent, getClientIpFromHeaders } from "@/lib/meta-capi"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type MetaEventsPayload = {
  eventName?: string
  eventId?: string
  eventSourceUrl?: string
  customData?: Record<string, unknown>
  userData?: {
    email?: string
    phone?: string
    firstName?: string
    lastName?: string
    externalId?: string
    fbp?: string
    fbc?: string
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    identifier: "meta-events",
  })
  if (limited) return limited

  let payload: MetaEventsPayload
  try {
    payload = (await req.json()) as MetaEventsPayload
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  if (!payload.eventName) {
    return NextResponse.json({ ok: false, error: "eventName is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = createAdminClient()

  const result = await fireCapiEvent(payload.eventName, {
    eventId: payload.eventId,
    eventSourceUrl: payload.eventSourceUrl ?? req.headers.get("referer") ?? undefined,
    userData: {
      email: payload.userData?.email,
      phone: payload.userData?.phone,
      firstName: payload.userData?.firstName,
      lastName: payload.userData?.lastName,
      externalId: payload.userData?.externalId ?? user?.id,
      fbp: payload.userData?.fbp,
      fbc: payload.userData?.fbc,
      clientIpAddress: getClientIpFromHeaders(req.headers),
      clientUserAgent: req.headers.get("user-agent") ?? undefined,
    },
    customData: payload.customData,
    consentContext: {
      headers: req.headers,
      userId: user?.id ?? payload.userData?.externalId,
      admin,
    },
  }).catch((err) => {
    console.error("[Meta CAPI] generic events route failed", err)
    return { ok: false as const, eventId: payload.eventId ?? "", error: String(err) }
  })

  if ("skipped" in result && result.skipped === "no_advertising_consent") {
    return NextResponse.json({ ok: true, skipped: "no_advertising_consent" })
  }

  return NextResponse.json({ ok: true })
}
