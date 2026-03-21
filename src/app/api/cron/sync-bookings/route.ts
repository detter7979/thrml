import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const date = yesterday()
  const supabase = createAdminClient()

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, total_charged, status")
    .eq("session_date", date)
    .in("status", ["confirmed", "completed"])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const revenue = (bookings ?? []).reduce((sum, b) => sum + Number(b.total_charged ?? 0), 0)
  const bookingsCount = (bookings ?? []).length

  const { error: upsertError } = await supabase.from("analytics_daily").upsert(
    {
      date,
      channel: "all",
      campaign_id: "",
      revenue,
      bookings_count: bookingsCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date,channel,campaign_id" }
  )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, date, revenue, bookings_count: bookingsCount })
}
