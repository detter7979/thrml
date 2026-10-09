import { NextRequest, NextResponse } from "next/server"

import { generateSocialPosts } from "@/lib/agent/social-generator"
import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

/**
 * Nightly organic social drafts. Posts land in creative_briefs as social_draft
 * and wait for approval in /admin → Agents → Creative → Social posts.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "social", status: "running" })
    .select("id")
    .single()
  const runId = runRow?.id ?? null

  try {
    const outcome = await generateSocialPosts(admin, { source: "agent-social", respectSchedule: true })
    const results = {
      date: new Date().toISOString().slice(0, 10),
      pillar: outcome.pillar,
      postsGenerated: outcome.created.length,
      failed: outcome.failed,
    }
    const status = outcome.created.length === 0 && outcome.failed.length > 0 ? "error" : "success"

    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          results,
          error_message: status === "error" ? outcome.failed.map((f) => `${f.platform}: ${f.reason}`).join("; ") : null,
        })
        .eq("id", runId)
    }

    return NextResponse.json({ ok: status === "success", ...results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          error_message: msg,
        })
        .eq("id", runId)
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
