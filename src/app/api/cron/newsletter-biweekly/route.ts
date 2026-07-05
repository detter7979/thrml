import { NextRequest, NextResponse } from "next/server"

import { processBiweeklyNewsletter } from "@/lib/emails/newsletter-biweekly"

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

  try {
    const result = await processBiweeklyNewsletter()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown newsletter error"
    console.error("[cron/newsletter-biweekly] failed", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
