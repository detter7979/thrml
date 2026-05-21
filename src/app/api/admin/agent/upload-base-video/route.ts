import { NextRequest, NextResponse } from "next/server"

import { baseVideoPath } from "@/lib/agent/gcs-paths"
import { getCreativeSignedWriteUrl } from "@/lib/agent/gcs"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    conceptSlug?: string
    assetSlug?: string
    version?: number
  } | null

  const conceptSlug = body?.conceptSlug?.trim()
  const assetSlug = body?.assetSlug?.trim()
  if (!conceptSlug || !assetSlug) {
    return NextResponse.json({ error: "conceptSlug and assetSlug required" }, { status: 400 })
  }

  const gcsPath = baseVideoPath({
    date: new Date(),
    conceptSlug,
    assetSlug,
    source: "uploaded",
    version: body?.version ?? 1,
  })

  const uploadUrl = await getCreativeSignedWriteUrl(gcsPath, "video/mp4")

  return NextResponse.json({ uploadUrl, gcsPath })
}
