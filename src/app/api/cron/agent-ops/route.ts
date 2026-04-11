import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

type AlertInput = {
  severity: "CRITICAL" | "WARNING" | "INFO"
  category: string
  message: string
  details?: Record<string, unknown>
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const alerts: AlertInput[] = []

  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "ops", status: "running" })
    .select("id").single()
  const runId = runRow?.id ?? null

  try {
    const now = new Date()
    const h24Ago = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    const h48Ago = new Date(now.getTime() - 48 * 3600 * 1000).toISOString()
    const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()

    // ── Booking health ─────────────────────────────────────────────────────
    const { data: pendingHost } = await admin
      .from("bookings")
      .select("id, listing_id, created_at")
      .eq("status", "pending_host")
      .lt("created_at", h24Ago)
    if ((pendingHost ?? []).length > 0) {
      alerts.push({
        severity: "WARNING", category: "booking",
        message: `${pendingHost!.length} booking(s) pending host confirmation for >24h`,
        details: { booking_ids: pendingHost!.map(b => b.id) },
      })
    }

    const { data: stuckPending } = await admin
      .from("bookings")
      .select("id, created_at")
      .eq("status", "pending")
      .is("stripe_payment_intent_id", null)
      .lt("created_at", new Date(now.getTime() - 4 * 3600 * 1000).toISOString())
    if ((stuckPending ?? []).length > 0) {
      alerts.push({
        severity: "CRITICAL", category: "stripe",
        message: `${stuckPending!.length} booking(s) stuck 'pending' without Stripe PI — webhook may have failed`,
        details: { booking_ids: stuckPending!.map(b => b.id) },
      })
    }

    const { count: recentBookings } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "completed"])
      .gte("created_at", h48Ago)
    if ((recentBookings ?? 0) === 0) {
      const { count: totalEver } = await admin
        .from("bookings").select("id", { count: "exact", head: true })
        .in("status", ["confirmed", "completed"])
      if ((totalEver ?? 0) > 3) {
        alerts.push({
          severity: "WARNING", category: "booking",
          message: "No confirmed bookings in the last 48 hours",
          details: { checked_since: h48Ago },
        })
      }
    }

    // ── Listing health ─────────────────────────────────────────────────────
    const { data: staleListing } = await admin
      .from("listings")
      .select("id, title, price_solo")
      .or("published.eq.true,is_published.eq.true")
      .or("price_solo.is.null,price_solo.eq.0")
    if ((staleListing ?? []).length > 0) {
      alerts.push({
        severity: "WARNING", category: "listing",
        message: `${staleListing!.length} published listing(s) have missing/zero price_solo`,
        details: { listings: staleListing!.map(l => ({ id: l.id, title: l.title })) },
      })
    }

    // Listings with no bookings in 30 days
    const { data: allPublished } = await admin
      .from("listings").select("id, title, host_id")
      .or("published.eq.true,is_published.eq.true")
    const activeIds = new Set<string>()
    if ((allPublished ?? []).length > 0) {
      const { data: recentlyBooked } = await admin
        .from("bookings")
        .select("listing_id")
        .gte("created_at", d30Ago)
        .in("status", ["confirmed", "completed"])
      for (const b of recentlyBooked ?? []) activeIds.add(b.listing_id)
      const dormant = (allPublished ?? []).filter(l => !activeIds.has(l.id))
      if (dormant.length > 0) {
        alerts.push({
          severity: "INFO", category: "listing",
          message: `${dormant.length} published listing(s) with no bookings in 30 days`,
          details: { listings: dormant.map(l => ({ id: l.id, title: l.title })) },
        })
      }
    }

    // ── User/auth health ───────────────────────────────────────────────────
    const { data: noWelcomeEmail } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("onboarding_email_sent", false)
      .lt("created_at", new Date(now.getTime() - 3600 * 1000).toISOString())
    if ((noWelcomeEmail ?? []).length > 0) {
      alerts.push({
        severity: "INFO", category: "email",
        message: `${noWelcomeEmail!.length} user(s) never received welcome email (>1h old)`,
        details: { user_ids: noWelcomeEmail!.map(u => u.id) },
      })
    }

    // ── Agent health ───────────────────────────────────────────────────────
    const agentsToCheck = ["finance", "ads-evaluate", "disputes"]
    for (const agentName of agentsToCheck) {
      const { data: lastRun } = await admin
        .from("agent_runs")
        .select("status, started_at, error_message")
        .eq("agent_name", agentName)
        .order("started_at", { ascending: false })
        .limit(1).maybeSingle()
      if (!lastRun || new Date(lastRun.started_at) < new Date(h48Ago)) {
        alerts.push({
          severity: "WARNING", category: "agent",
          message: `Agent '${agentName}' hasn't run in 48h`,
          details: { last_run: lastRun?.started_at ?? null },
        })
      } else if (lastRun.status === "error") {
        alerts.push({
          severity: "WARNING", category: "agent",
          message: `Agent '${agentName}' last run failed`,
          details: { error: lastRun.error_message, started_at: lastRun.started_at },
        })
      }
    }

    // ── Support ticket health ──────────────────────────────────────────────
    const { count: openTickets } = await admin
      .from("support_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_human")
    if ((openTickets ?? 0) > 5) {
      alerts.push({
        severity: "WARNING", category: "support",
        message: `${openTickets} support tickets awaiting human review`,
        details: { count: openTickets },
      })
    }

    // Write all alerts to DB
    if (alerts.length > 0) {
      await admin.from("ops_alerts").insert(
        alerts.map(a => ({ ...a, details: a.details ?? null }))
      )
    }

    const summary = {
      critical: alerts.filter(a => a.severity === "CRITICAL").length,
      warning: alerts.filter(a => a.severity === "WARNING").length,
      info: alerts.filter(a => a.severity === "INFO").length,
      total: alerts.length,
    }

    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, results: summary,
    }).eq("id", runId)

    return NextResponse.json({ ok: true, ...summary, alerts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) await admin.from("agent_runs").update({
      status: "error", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, error_message: msg,
    }).eq("id", runId)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
