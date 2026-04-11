import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/emails/send"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function badge(severity: string) {
  if (severity === "CRITICAL") return `<span style="background:#C0392B;color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700">CRITICAL</span>`
  if (severity === "WARNING") return `<span style="background:#E67E22;color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700">WARNING</span>`
  return `<span style="background:#27AE60;color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700">INFO</span>`
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const h24Ago = new Date(Date.now() - 86400000).toISOString()

  try {
    // ── Finance snapshot ───────────────────────────────────────────────────
    const { data: finance } = await admin
      .from("finance_snapshots")
      .select("*").eq("snapshot_date", yesterday).maybeSingle()

    // ── Ops alerts (last 24h unresolved) ──────────────────────────────────
    const { data: alerts } = await admin
      .from("ops_alerts")
      .select("severity, category, message")
      .eq("resolved", false)
      .gte("created_at", h24Ago)
      .order("severity", { ascending: true })

    const criticals = (alerts ?? []).filter(a => a.severity === "CRITICAL")
    const warnings = (alerts ?? []).filter(a => a.severity === "WARNING")
    const infos = (alerts ?? []).filter(a => a.severity === "INFO")

    // ── Agent runs yesterday ───────────────────────────────────────────────
    const { data: agentRuns } = await admin
      .from("agent_runs")
      .select("agent_name, status, duration_ms, results, error_message")
      .gte("started_at", h24Ago)
      .order("started_at", { ascending: true })

    // ── Bookings yesterday ─────────────────────────────────────────────────
    const { data: newBookings } = await admin
      .from("bookings")
      .select("id, total_charged, status, listing_id")
      .gte("created_at", h24Ago)
      .in("status", ["confirmed", "completed", "pending_host"])
      .order("created_at", { ascending: false })

    // ── Pending support tickets ─────────────────────────────────────────────
    const { count: pendingTickets } = await admin
      .from("support_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_human")

    // ── Social queue items pending review ──────────────────────────────────
    const { count: pendingSocial } = await admin
      .from("creative_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING")
      .gte("created_at", h24Ago)

    // ── Build email ────────────────────────────────────────────────────────
    const subjectPrefix = criticals.length > 0 ? "🚨 " : warnings.length > 0 ? "⚠️ " : "✅ "
    const bookingRevenue = (newBookings ?? []).reduce((s, b) => s + Number(b.total_charged ?? 0), 0)

    const alertsHtml = (alerts ?? []).length === 0
      ? `<p style="color:#27AE60;font-size:14px">No alerts — all systems healthy.</p>`
      : (alerts ?? []).map(a => `
        <div style="margin-bottom:8px;padding:8px 12px;background:#FCFAF7;border-left:3px solid ${a.severity === "CRITICAL" ? "#C0392B" : a.severity === "WARNING" ? "#E67E22" : "#27AE60"};border-radius:2px">
          ${badge(a.severity)} <span style="margin-left:8px;font-size:13px;color:#3E3329">[${a.category}] ${a.message}</span>
        </div>`).join("")

    const agentHtml = (agentRuns ?? []).map(r => {
      const icon = r.status === "success" ? "✅" : r.status === "error" ? "❌" : "⏳"
      const duration = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"
      return `<tr>
        <td style="padding:6px 8px;border-top:1px solid #EDE8E2;font-size:13px">${icon} ${r.agent_name}</td>
        <td style="padding:6px 8px;border-top:1px solid #EDE8E2;font-size:13px;color:#796A5E">${duration}</td>
        <td style="padding:6px 8px;border-top:1px solid #EDE8E2;font-size:12px;color:${r.status === "error" ? "#C0392B" : "#796A5E"}">${r.error_message ?? JSON.stringify(r.results ?? {}).slice(0, 60)}</td>
      </tr>`
    }).join("")

    const bookingsHtml = (newBookings ?? []).length === 0
      ? `<p style="color:#796A5E;font-size:14px">No new bookings yesterday.</p>`
      : (newBookings ?? []).slice(0, 5).map(b => `
        <div style="font-size:13px;padding:4px 0;border-top:1px solid #EDE8E2">
          <span style="color:#1A1410">${b.status === "pending_host" ? "🕐 Requested" : "✅ Confirmed"}</span>
          &nbsp;·&nbsp;${fmt(Number(b.total_charged ?? 0))}
        </div>`).join("") + ((newBookings ?? []).length > 5 ? `<p style="font-size:12px;color:#796A5E">+${(newBookings ?? []).length - 5} more</p>` : "")

    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;color:#1A1410;padding:24px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <div>
    <h2 style="margin:0;font-size:20px">thrml Agent Digest</h2>
    <p style="margin:0;color:#796A5E;font-size:13px">${today} · Good morning, Dom</p>
  </div>
</div>

<!-- Stats row -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
  ${[
    { label: "Yesterday Revenue", value: finance ? fmt(Number(finance.net_platform_revenue)) : "—" },
    { label: "New Bookings", value: String((newBookings ?? []).length) },
    { label: "Open Tickets", value: String(pendingTickets ?? 0) },
    { label: "Content Queued", value: String(pendingSocial ?? 0) },
  ].map(s => `<div style="background:#F5F0EA;border-radius:8px;padding:12px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;color:#796A5E;text-transform:uppercase;letter-spacing:0.05em">${s.label}</p>
    <p style="margin:0;font-size:20px;font-weight:700">${s.value}</p>
  </div>`).join("")}
</div>

<!-- Alerts -->
<h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#796A5E">Ops Alerts (${(alerts ?? []).length})</h3>
${alertsHtml}

<!-- Bookings -->
<h3 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#796A5E">Yesterday's Bookings · ${fmt(bookingRevenue)}</h3>
${bookingsHtml}

<!-- Agent runs -->
<h3 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#796A5E">Agent Runs</h3>
<table style="width:100%;border-collapse:collapse">
  <tr style="background:#F5F0EA">
    <th style="padding:6px 8px;text-align:left;font-size:12px">Agent</th>
    <th style="padding:6px 8px;text-align:left;font-size:12px">Duration</th>
    <th style="padding:6px 8px;text-align:left;font-size:12px">Summary</th>
  </tr>
  ${agentHtml || '<tr><td colspan="3" style="padding:8px;font-size:13px;color:#796A5E">No agent runs found for yesterday.</td></tr>'}
</table>

<!-- Action items -->
${(pendingTickets ?? 0) > 0 || criticals.length > 0 ? `
<div style="margin-top:20px;background:#FEF3F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px">
  <p style="margin:0;font-size:13px;font-weight:600;color:#C0392B">Action Required</p>
  ${(pendingTickets ?? 0) > 0 ? `<p style="margin:4px 0 0;font-size:13px">· ${pendingTickets} support ticket(s) need your review → <a href="https://usethrml.com/admin/support-tickets" style="color:#C4623A">Review now</a></p>` : ""}
  ${criticals.map(a => `<p style="margin:4px 0 0;font-size:13px">· ${a.message}</p>`).join("")}
</div>` : ""}

<p style="font-size:11px;color:#796A5E;margin-top:24px;border-top:1px solid #EDE8E2;padding-top:12px">
  thrml agent digest · auto-generated at 07:00 UTC · 
  <a href="https://usethrml.com/admin" style="color:#C4623A">Admin Dashboard</a>
</p>
</div>`

    const subjectRevenue = finance ? ` · ${fmt(Number(finance.net_platform_revenue))} revenue` : ""
    const alertSummary = criticals.length > 0 ? ` · ${criticals.length} critical` : warnings.length > 0 ? ` · ${warnings.length} warnings` : " · all clear"

    await sendEmail({
      to: "etter.dom@gmail.com",
      subject: `${subjectPrefix}thrml Digest${subjectRevenue}${alertSummary}`,
      html,
      text: `thrml Agent Digest — ${today}\n\nAlerts: ${criticals.length} critical, ${warnings.length} warnings\nBookings: ${(newBookings ?? []).length} (${fmt(bookingRevenue)})\nOpen tickets: ${pendingTickets ?? 0}\nContent queued: ${pendingSocial ?? 0}`,
    })

    return NextResponse.json({ ok: true, date: today, alertCount: (alerts ?? []).length, bookingCount: (newBookings ?? []).length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
