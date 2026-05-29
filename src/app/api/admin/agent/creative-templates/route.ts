import { NextRequest, NextResponse } from "next/server"

import { getCreativeTemplate, buildBriefFromTemplate, loadCreativeTemplates } from "@/lib/agent/creative-templates"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
  }))

  return NextResponse.json({ templates })
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
  return NextResponse.json({ brief: data })
}
