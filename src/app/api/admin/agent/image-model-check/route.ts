import { NextResponse } from "next/server"

import { currentImageModel, generateImagen } from "@/lib/agent/imagen"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Admin: generate one small test image to confirm which Vertex image model works for this project. */
export async function POST() {
  const { error } = await requireAdminApi()
  if (error) return error
  const t0 = Date.now()
  try {
    const [img] = await generateImagen("an empty cedar sauna interior with soft window light", {
      aspectRatio: "1:1",
      count: 1,
    })
    return NextResponse.json({
      ok: true,
      model: currentImageModel(),
      mimeType: img?.mimeType,
      bytes: img ? Math.round((img.base64.length * 3) / 4) : 0,
      ms: Date.now() - t0,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 }, { status: 500 })
  }
}
