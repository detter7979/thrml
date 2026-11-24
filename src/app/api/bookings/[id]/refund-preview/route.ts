import { NextRequest, NextResponse } from "next/server"

import {
  computeRefund,
  getPolicyTimeline,
  normalizeCancellationPolicy,
  parseSessionStart,
  serializePolicyReminder,
} from "@/lib/cancellations"
import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { id: string }

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const limited = await rateLimit(req, {
    maxRequests: 20,
    windowMs: 60 * 1000,
    identifier: "bookings",
  })
  if (limited) return limited

  const { id } = await params
  const role = req.nextUrl.searchParams.get("role")
  const cancelledBy: "guest" | "host" = role === "host" ? "host" : "guest"

  const { error: authError, session } = await requireAuth()
  if (authError || !session) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: booking, error } = await admin.from("bookings").select("*").eq("id", id).single()
  if (error || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

  if (cancelledBy === "guest" && booking.guest_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (cancelledBy === "host" && booking.host_id !== session.user.id) {
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
  const serviceFee = Number(booking.service_fee ?? 0)
  // Same function the cancel route uses, so the preview always matches the refund issued.
  const preview = computeRefund({
    cancelledBy,
    policy: listing?.cancellation_policy,
    sessionStart,
    refundAnchor: booking.refund_anchor_at ? new Date(booking.refund_anchor_at) : null,
    totalCharged: Number(booking.total_charged ?? 0),
    serviceFee,
  })

  return NextResponse.json({
    refund_amount: Math.max(0, preview.refundAmount),
    refund_status: preview.refundAmount > 0 ? "eligible" : "none",
    platform_fee: serviceFee,
    policy_name: policy,
    policy_applied: preview.policyApplied,
    timeline,
    hours_until_session: sessionStart ? Math.max(0, Math.floor(preview.hoursUntilSession)) : null,
    policy_reminder: serializePolicyReminder(policy, sessionStart),
  })
}
