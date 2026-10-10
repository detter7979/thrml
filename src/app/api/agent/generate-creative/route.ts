import { NextRequest, NextResponse } from "next/server"

import { generateCreativeVariations } from "@/lib/agent/creative-generation"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    brief_id?: string
    limit?: number
  } | null

  try {
    const briefId = typeof body?.brief_id === "string" ? body.brief_id.trim() : ""
    if (!briefId) return NextResponse.json({ error: "Expected { brief_id: string }" }, { status: 400 })
    const limit = 1

    if (briefId) {
      const now = new Date().toISOString()
      const { data, error: updateError } = await admin!
        .from("creative_briefs")
        .update({ approved_at: now, status: "approved" })
        .eq("id", briefId)
        .select("*")
        .maybeSingle()

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: "Brief not found" }, { status: 404 })
    }

    const results = await generateCreativeVariations({
      limit,
      ...(briefId ? { briefIds: [briefId] } : {}),
    })

    const ok = results.errors.length === 0
    return NextResponse.json({ ok, generationQueued: false, ...results }, { status: ok ? 200 : 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown creative generation error"
    console.error("[agent/generate-creative] failed", err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
