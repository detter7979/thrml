import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

/**
 * Data for /admin/agents (Overview, Inbox, Finance tabs). agent_runs, ops_alerts,
 * finance_snapshots and inbox_drafts are server-only tables (RLS on, no client
 * policies), so the page must read them through this admin-guarded route.
 */
export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const [runs, alerts, finance, drafts, socialDrafts] = await Promise.all([
    admin!.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(30),
    admin!.from("ops_alerts").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
    admin!.from("finance_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(14),
    admin!
      .from("inbox_drafts")
      .select("*")
      .eq("approved", false)
      .is("sent_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    admin!
      .from("creative_briefs")
      .select("id", { count: "exact", head: true })
      .eq("trigger_type", "social")
      .eq("status", "social_draft"),
  ])

  const failed = [runs, alerts, finance, drafts, socialDrafts].find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({
    runs: runs.data ?? [],
    alerts: alerts.data ?? [],
    finance: finance.data ?? [],
    drafts: drafts.data ?? [],
    socialDraftCount: socialDrafts.count ?? 0,
  })
}

/** { action: "resolve_alert" | "approve_draft", id } */
export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; id?: unknown }
  if (typeof body.id !== "string") return NextResponse.json({ error: "Expected id" }, { status: 400 })
  const now = new Date().toISOString()

  const result =
    body.action === "resolve_alert"
      ? await admin!.from("ops_alerts").update({ resolved: true, resolved_at: now }).eq("id", body.id)
      : body.action === "approve_draft"
        ? await admin!.from("inbox_drafts").update({ approved: true, approved_at: now }).eq("id", body.id)
        : null

  if (!result) return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
