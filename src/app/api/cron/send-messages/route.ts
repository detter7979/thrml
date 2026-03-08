import { NextRequest, NextResponse } from "next/server"

import { processScheduledMessages } from "@/lib/automated-messages"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("cron_secret") ??
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  if (!secret || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await processScheduledMessages()
  return NextResponse.json({ sent: result.sent })
}
