import { NextRequest, NextResponse } from "next/server"

import { exportAgentData } from "@/lib/agent/agent-export"
import { createAdminClient } from "@/lib/supabase/admin"

function readCronSecret(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || readCronSecret(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const goalFilter = url.searchParams.get("goal_type")
  const admin = createAdminClient()
  const payload = await exportAgentData(admin, goalFilter)

  return NextResponse.json(payload)
}
