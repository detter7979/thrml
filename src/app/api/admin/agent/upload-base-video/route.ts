import { NextRequest, NextResponse } from "next/server"

import { ensureCreativeBucketCors, getCreativeSignedWriteUrl, uploadBufferToCreativeObject } from "@/lib/agent/gcs"
import { baseVideoPath } from "@/lib/agent/gcs-paths"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
/** Direct browser → storage uploads skip the function body limit, so they can be much larger. */
const MAX_DIRECT_UPLOAD_BYTES = 1024 * 1024 * 1024
const DIRECT_UPLOAD_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"])

function resolveUploadPath(body: {
  conceptSlug: string
  assetSlug: string
  version?: number
  category?: string
  angleSlug?: string
}) {
  const category = body.category?.trim() || "Hosts"
  const angleSlug = body.angleSlug?.trim() || body.conceptSlug.replace(/-/g, "_")
  return baseVideoPath({
    date: new Date(),
    conceptSlug: body.conceptSlug,
    assetSlug: body.assetSlug,
    source: "uploaded",
    version: body.version ?? 1,
    category,
    angleSlug,
  })
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid upload payload"
      return NextResponse.json({ error: "Could not read upload", detail: message }, { status: 400 })
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    const conceptSlug = String(form.get("conceptSlug") ?? "").trim()
    const assetSlug = String(form.get("assetSlug") ?? "").trim()
    if (!conceptSlug || !assetSlug) {
      return NextResponse.json({ error: "conceptSlug and assetSlug required" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Video too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)` },
        { status: 413 },
      )
    }

    const gcsPath = resolveUploadPath({
      conceptSlug,
      assetSlug,
      version: Number(form.get("version") ?? 1) || 1,
      category: String(form.get("category") ?? ""),
      angleSlug: String(form.get("angleSlug") ?? ""),
    })

    try {
      const uploaded = await uploadBufferToCreativeObject(gcsPath, buffer, file.type || "video/mp4")
      return NextResponse.json({ gcsPath, gcsUrl: uploaded.gcsUrl, uploaded: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : "GCS upload failed"
      console.error("[upload-base-video] multipart upload failed", err)
      return NextResponse.json({ error: "Upload to storage failed", detail: message }, { status: 500 })
    }
  }

  const body = (await req.json().catch(() => null)) as {
    conceptSlug?: string
    assetSlug?: string
    version?: number
    category?: string
    angleSlug?: string
    contentType?: string
    size?: number
  } | null

  const conceptSlug = body?.conceptSlug?.trim()
  const assetSlug = body?.assetSlug?.trim()
  if (!conceptSlug || !assetSlug) {
    return NextResponse.json({ error: "conceptSlug and assetSlug required" }, { status: 400 })
  }

  // Direct upload: hand the browser a short-lived signed URL so the file goes straight to
  // storage. Sending the file through this function fails for anything over the platform's
  // ~4.5 MB request limit, which is every real video.
  const videoType = (body?.contentType ?? "").trim().toLowerCase() || "video/mp4"
  if (!DIRECT_UPLOAD_TYPES.has(videoType)) {
    return NextResponse.json({ error: "Upload an MP4, MOV or WebM video." }, { status: 400 })
  }
  const size = Number(body?.size ?? 0)
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Video too large (max ${Math.round(MAX_DIRECT_UPLOAD_BYTES / (1024 * 1024))}MB)` },
      { status: 413 },
    )
  }

  const gcsPath = resolveUploadPath({
    conceptSlug,
    assetSlug,
    version: body?.version,
    category: body?.category,
    angleSlug: body?.angleSlug,
  })

  try {
    const origin = req.headers.get("origin") ?? new URL(req.url).origin
    const cors = await ensureCreativeBucketCors(origin)
    if (!cors.ok) console.warn("[upload-base-video] could not confirm bucket CORS:", cors.error)
    const uploadUrl = await getCreativeSignedWriteUrl(gcsPath, videoType)
    return NextResponse.json({ uploadUrl, gcsPath, contentType: videoType, corsOk: cors.ok, corsError: cors.error ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not prepare upload"
    console.error("[upload-base-video] signed URL failed", err)
    return NextResponse.json({ error: "Could not prepare the upload", detail: message }, { status: 500 })
  }
}
