import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import {
  gsutilUploadCommand,
  resolveCreativeBucketName,
  suggestedT4BaseVideoGsUri,
  suggestedT4BaseVideoObjectPath,
} from "@/lib/agent/t4-base-video-upload"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function legacyBaseExample() {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `bases/${yyyy}/${mm}/pov-earnings/sauna_v1.mp4`
}

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const mainBucket = process.env.GCS_BUCKET_NAME?.trim() ?? ""
  const creativeBucket = resolveCreativeBucketName(mainBucket)
  const pathPrefix = (process.env.GCS_PATH_PREFIX ?? "").trim()
  const suggestedObjectPath = suggestedT4BaseVideoObjectPath()

  return NextResponse.json({
    mainBucket,
    creativeBucket,
    /** Legacy brief uploads use this prefix on the main bucket (not a separate bucket). */
    pathPrefix: pathPrefix || null,
    separateCreativeBucket: Boolean(process.env.GCS_CREATIVE_BUCKET?.trim()),
    suggestedObjectPath,
    suggestedGsUri: suggestedT4BaseVideoGsUri(creativeBucket),
    gsutilCommand: gsutilUploadCommand("your-sauna.mp4", creativeBucket),
    legacyBaseExample: legacyBaseExample(),
    canonicalPrefix: suggestedObjectPath.split("/").slice(0, 4).join("/"),
  })
}
