import { NextRequest, NextResponse } from "next/server"

import { generateStaticCreatives } from "@/lib/agent/static-generator"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 900

const AGENT_NAME = "creative-static"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: AGENT_NAME, status: "running" })
    .select("id")
    .single()
  const runId = runRow?.id ?? null

  try {
    const results = await generateStaticCreatives({ limit: 3 })
    const status = results.errors.length > 0 && results.generated === 0 ? "error" : "success"

    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          results,
          error_message: results.errors.length ? `${results.errors.length} creative brief(s) failed` : null,
        })
        .eq("id", runId)
    }

    return NextResponse.json({ ok: status === "success", ...results }, { status: status === "success" ? 200 : 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown static generation error"
    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          error_message: message,
        })
        .eq("id", runId)
    }

    console.error("[agent-creative-static] failed", err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
