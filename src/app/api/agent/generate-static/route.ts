import { NextRequest, NextResponse } from "next/server"

import {
  processStaticBrief,
  staticGeneratorValidation,
  type StaticFormat,
} from "@/lib/agent/static-generator"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    briefId?: unknown
    generator?: unknown
    formats?: unknown
    variations?: unknown
  } | null

  const briefId = typeof body?.briefId === "string" ? body.briefId.trim() : ""
  if (!UUID_RE.test(briefId)) {
    return NextResponse.json({ ok: false, error: "briefId must be a valid UUID" }, { status: 400 })
  }

  const generator = staticGeneratorValidation.normalizeGenerator(body?.generator)
  if (!generator) {
    return NextResponse.json({ ok: false, error: "generator must be imagen, replicate, or both" }, { status: 400 })
  }

  const requestedFormats = Array.isArray(body?.formats) ? body.formats : []
  const formats = requestedFormats
    .map(staticGeneratorValidation.normalizeFormat)
    .filter((value): value is StaticFormat => Boolean(value))
  if (formats.length === 0 || formats.length !== requestedFormats.length) {
    return NextResponse.json({ ok: false, error: "formats must contain 1x1 and/or 9x16" }, { status: 400 })
  }

  const variations = staticGeneratorValidation.normalizeVariationCount(body?.variations)
  if (!variations) {
    return NextResponse.json({ ok: false, error: "variations must be 1, 2, or 3" }, { status: 400 })
  }

  try {
    const generated = await processStaticBrief({
      briefId,
      generator,
      formats: Array.from(new Set(formats)),
      variations,
    })

    return NextResponse.json({ ok: true, processed: 1, generated, errors: [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown static generation error"
    console.error("[agent/generate-static] failed", err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
