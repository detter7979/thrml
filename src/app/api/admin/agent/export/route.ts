import { NextRequest, NextResponse } from "next/server"

import { exportAgentData } from "@/lib/agent/agent-export"
import { requireAdminApi } from "@/lib/admin-guard"

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const url = new URL(req.url)
  const goalFilter = url.searchParams.get("goal_type")
  const payload = await exportAgentData(admin, goalFilter)

  return NextResponse.json(payload)
}
