import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

type StaticFormat = "1x1" | "9x16"

function formatsForBrief(format: unknown): StaticFormat[] {
  if (typeof format !== "string") return ["1x1"]

  const formats = new Set<StaticFormat>()
  for (const value of format.split(/[,/+\s]+/)) {
    if (value === "1x1" || value === "9x16") formats.add(value)
  }
  return formats.size > 0 ? Array.from(formats) : ["1x1"]
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { briefId?: string; brief_id?: string } | null
  const briefId = (body?.briefId ?? body?.brief_id ?? "").trim()
  if (!briefId) return NextResponse.json({ error: "Expected { briefId: string }" }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error: updateError } = await admin!
    .from("creative_briefs")
    .update({ status: "approved", approved_at: now })
    .eq("id", briefId)
    .select("*")
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Brief not found" }, { status: 404 })

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const cookie = req.headers.get("cookie")
  if (cookie) headers.cookie = cookie

  void fetch(new URL("/api/agent/generate-static", req.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      briefId: data.id,
      generator: "both",
      formats: formatsForBrief(data.format),
      variations: 3,
    }),
  }).catch((err) => {
    console.error("[agent/approve-brief] failed to start static generation", err)
  })

  await admin!
    .from("creative_queue")
    .update({ approved_at: now, approved_by: "dom", status: "brief_ready" })
    .eq("brief_id", briefId)

  return NextResponse.json({ ok: true, briefId: data.id, generationStarted: true })
}
