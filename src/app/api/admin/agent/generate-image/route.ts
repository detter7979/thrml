import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { generatePromptImages, isPromptImageAspect, isPromptImageModel } from "@/lib/agent/prompt-image"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Prompt → images saved to the creative asset library, ready to pick as a brief's photo. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    prompt?: string
    model?: string
    aspect_ratio?: string
    count?: number
  } | null

  const prompt = body?.prompt?.trim() ?? ""
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  if (prompt.length > 4000) return NextResponse.json({ error: "prompt is too long (max 4000 characters)" }, { status: 400 })
  const model = isPromptImageModel(body?.model) ? body!.model : "nano_banana"
  const aspectRatio = isPromptImageAspect(body?.aspect_ratio) ? body!.aspect_ratio : "4:3"
  const count = Math.min(Math.max(Math.round(Number(body?.count) || 2), 1), 4) as 1 | 2 | 3 | 4

  try {
    const images = await generatePromptImages({ prompt, model, aspectRatio, count })
    return NextResponse.json({ images, model, aspect_ratio: aspectRatio })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image generation failed" }, { status: 500 })
  }
}
