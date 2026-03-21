import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// POST { days: 30 } — documents manual backfill; crons always use "yesterday".
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { days = 30 } = (await req.json().catch(() => ({}))) as { days?: number }

  return NextResponse.json({
    message: `To backfill ${days} days: trigger each cron manually from Vercel Dashboard → Cron Jobs, or wait for daily runs.`,
    tip: "For a one-time historical pull, use the GA4 Explore report and Meta Ads CSV export into the admin earnings tab.",
    cronRoutes: ["/api/cron/sync-ga4", "/api/cron/sync-meta", "/api/cron/sync-bookings"],
  })
}
