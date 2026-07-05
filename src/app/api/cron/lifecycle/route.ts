import { NextRequest, NextResponse } from "next/server"

import { processGuestLifecycle } from "@/lib/emails/guest-lifecycle"
import { processHostLifecycle } from "@/lib/emails/host-lifecycle"
import { processSupportFollowUps } from "@/lib/emails/support-followups"

export const maxDuration = 300

function authGuard(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  return Boolean(secret && supplied === secret)
}

export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [hostResult, guestResult, supportResult] = await Promise.allSettled([
    processHostLifecycle(),
    processGuestLifecycle(),
    processSupportFollowUps(),
  ])

  return NextResponse.json({
    ok: true,
    host_lifecycle: hostResult.status === "fulfilled" ? hostResult.value : { error: String(hostResult.reason) },
    guest_lifecycle: guestResult.status === "fulfilled" ? guestResult.value : { error: String(guestResult.reason) },
    support_followups:
      supportResult.status === "fulfilled" ? supportResult.value : { error: String(supportResult.reason) },
  })
}
