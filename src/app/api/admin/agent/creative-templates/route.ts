import { NextRequest, NextResponse } from "next/server"

import { getCreativeTemplate, buildBriefFromTemplate, loadCreativeTemplates } from "@/lib/agent/creative-templates"
import { loadSvgTemplateRegistry } from "@/lib/agent/svg-template-generator"
import { processStaticBrief } from "@/lib/agent/static-generator"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const templates = loadCreativeTemplates().map((t) => ({
    id: t.id,
    label: t.label,
    type: t.type,
    category: t.category,
    angle: t.angle,
    formats: t.formats,
    default_variations: t.default_variations,
    concept_verify_default: t.concept_verify_default,
    full_batch_variations: t.full_batch_variations,
    naming: t.naming,
    generation_tool: t.generation_tool ?? null,
    svg_template_id: t.svg_template_id ?? null,
  }))

  const svgTemplates = loadSvgTemplateRegistry()

  return NextResponse.json({ templates, svgTemplates })
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as {
    templateId?: string
    conceptVerify?: boolean
    uploadedGcsPath?: string
    saveAndApprove?: boolean
  } | null

  const templateId = body?.templateId?.trim()
  if (!templateId) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 })
  }

  const template = getCreativeTemplate(templateId)
  if (!template) {
    return NextResponse.json({ error: `Unknown template: ${templateId}` }, { status: 404 })
  }

  if (template.type === "video" && template.video?.source === "uploaded" && !body?.uploadedGcsPath?.trim()) {
    return NextResponse.json(
      { error: "uploadedGcsPath is required for uploaded-video templates (T4)" },
      { status: 400 }
    )
  }

  const briefPayload = buildBriefFromTemplate(template, {
    conceptVerify: body?.conceptVerify,
    uploadedGcsPath: body?.uploadedGcsPath?.trim(),
  })

  const saveAndApprove = Boolean(body?.saveAndApprove)
  const now = new Date().toISOString()

  const { data, error: insertError } = await admin!
    .from("creative_briefs")
    .insert({
      ...briefPayload,
      status: saveAndApprove ? "approved" : briefPayload.status,
      approved_at: saveAndApprove ? now : null,
      created_by: "admin",
    })
    .select("*")
    .maybeSingle()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Failed to create brief" }, { status: 500 })

  if (saveAndApprove && !data.video_config) {
    try {
      const generated = await processStaticBrief({ briefId: data.id })
      const { data: updated, error: reloadError } = await admin!
        .from("creative_briefs")
        .select("*")
        .eq("id", data.id)
        .maybeSingle()

      if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 })
      return NextResponse.json({ brief: updated ?? data, generated })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Static generation failed"
      console.error("[creative-templates] saveAndApprove generation failed", err)

      await admin!
        .from("creative_briefs")
        .update({ status: "briefed", approved_at: null })
        .eq("id", data.id)

      return NextResponse.json({ error: message, brief: data }, { status: 500 })
    }
  }

  return NextResponse.json({ brief: data })
}
