import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function GET(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const status = req.nextUrl.searchParams.get("status")
  const start = req.nextUrl.searchParams.get("start")
  const end = req.nextUrl.searchParams.get("end")
  const userId = req.nextUrl.searchParams.get("userId")

  let query = admin
    .from("bookings")
    .select(
      "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, subtotal, service_fee, host_payout, total_charged, refunded_amount, created_at"
    )
    .order("created_at", { ascending: false })

  if (status && status !== "all") query = query.eq("status", status)
  if (start) query = query.gte("session_date", start)
  if (end) query = query.lte("session_date", end)
  if (userId) query = query.or(`guest_id.eq.${userId},host_id.eq.${userId}`)

  const { data, error: queryError } = await query
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 })
  return NextResponse.json({ bookings: data ?? [] })
}
