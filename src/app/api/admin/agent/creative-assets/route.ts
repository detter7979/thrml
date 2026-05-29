import { NextRequest, NextResponse } from "next/server"

import { listCreativeAssetLibrary } from "@/lib/agent/gcs"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const prefix = searchParams.get("prefix") ?? undefined
  const mediaType = searchParams.get("mediaType") as "static" | "video" | "all" | null
  const limit = Number(searchParams.get("limit") ?? "100")

  try {
    const assets = await listCreativeAssetLibrary({
      prefix: prefix ?? undefined,
      mediaType: mediaType === "static" || mediaType === "video" ? mediaType : "all",
      limit: Number.isFinite(limit) ? limit : 100,
    })
    return NextResponse.json({ assets })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list assets"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
