import { NextRequest, NextResponse } from "next/server"

import {
  getPolicyTimeline,
  hoursUntilSession,
  normalizeCancellationPolicy,
  parseSessionStart,
  serializePolicyReminder,
} from "@/lib/cancellations"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type Params = { id: string }

async function calculateRefundPreview(bookingId: string, cancelledBy: "guest" | "host") {
  const admin = createAdminClient()
  const argsList: Record<string, unknown>[] = [
    { booking_id: bookingId, cancelled_by: cancelledBy },
    { bookingid: bookingId, cancelledby: cancelledBy },
    { bookingId, cancelledBy },
  ]

  for (const args of argsList) {
    const { data, error } = await admin.rpc("calculate_refund", args)
    if (error) continue

    if (typeof data === "number") {
      return { refundAmount: Number(data), policyApplied: "rpc" }
    }
    if (Array.isArray(data) && data.length > 0) {
      const row = (data[0] ?? {}) as Record<string, unknown>
      return {
        refundAmount: Number(row.refund_amount ?? row.amount ?? 0),
        policyApplied: typeof row.policy_applied === "string" ? row.policy_applied : "rpc",
      }
    }
    if (data && typeof data === "object") {
      const row = data as Record<string, unknown>
      return {
        refundAmount: Number(row.refund_amount ?? row.amount ?? 0),
        policyApplied: typeof row.policy_applied === "string" ? row.policy_applied : "rpc",
      }
    }
  }

  return { refundAmount: 0, policyApplied: "rpc_unavailable" }
}

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const role = req.nextUrl.searchParams.get("role")
  const cancelledBy: "guest" | "host" = role === "host" ? "host" : "guest"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: booking, error } = await admin.from("bookings").select("*").eq("id", id).single()
  if (error || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

  if (cancelledBy === "guest" && booking.guest_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (cancelledBy === "host" && booking.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, title, cancellation_policy")
    .eq("id", booking.listing_id)
    .maybeSingle()

  const policy = normalizeCancellationPolicy(listing?.cancellation_policy)
  const timeline = getPolicyTimeline(policy)
  const sessionStart = parseSessionStart(booking.session_date, booking.start_time)
  const preview = await calculateRefundPreview(id, cancelledBy)
  const serviceFee = Number(booking.service_fee ?? 0)

  return NextResponse.json({
    refund_amount: Math.max(0, Number(preview.refundAmount ?? 0)),
    refund_status: Number(preview.refundAmount ?? 0) > 0 ? "eligible" : "none",
    platform_fee: serviceFee,
    policy_name: policy,
    policy_applied: preview.policyApplied,
    timeline,
    hours_until_session: sessionStart ? Math.max(0, Math.floor(hoursUntilSession(sessionStart))) : null,
    policy_reminder: serializePolicyReminder(policy, sessionStart),
  })
}
