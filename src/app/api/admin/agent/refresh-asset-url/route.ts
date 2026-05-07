import { NextRequest, NextResponse } from "next/server"

import { normalizeCreativeAssetGcsPath, refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { requireAdminApi } from "@/lib/admin-guard"

type CreativeAssetRow = {
  id: string
  gcs_path: string | null
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as { assetId?: string } | null
  if (!body?.assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 })
  }

  const { data: asset, error: assetError } = await admin!
    .from("creative_assets")
    .select("id, gcs_path")
    .eq("id", body.assetId)
    .maybeSingle()

  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 })
  const row = asset as CreativeAssetRow | null
  if (!row?.gcs_path) return NextResponse.json({ error: "Asset is missing gcs_path" }, { status: 404 })

  let normalizedGcsPath: string
  let gcsUrl: string
  try {
    normalizedGcsPath = normalizeCreativeAssetGcsPath(row.gcs_path)
    gcsUrl = await refreshCreativeAssetUrl(normalizedGcsPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not refresh asset URL"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const { error: updateError } = await admin!
    .from("creative_assets")
    .update({ gcs_path: normalizedGcsPath, gcs_url: gcsUrl })
    .eq("id", row.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ gcsUrl })
}
