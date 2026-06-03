import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

// POST { days: 30 } — documents manual backfill; crons always use "yesterday".
export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const { days = 30 } = (await req.json().catch(() => ({}))) as { days?: number }

  return NextResponse.json({
    message: `To backfill ${days} days: trigger each cron manually from Vercel Dashboard → Cron Jobs, or wait for daily runs.`,
    tip: "For a one-time historical pull, use the GA4 Explore report and Meta Ads CSV export into the admin earnings tab.",
    cronRoutes: ["/api/cron/sync-ga4", "/api/cron/sync-meta", "/api/cron/sync-bookings"],
  })
}
