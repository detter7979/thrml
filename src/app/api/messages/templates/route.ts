import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { DEFAULT_TEMPLATE_CONTENT, TEMPLATE_TYPES } from "@/lib/automated-messages"
import { createClient } from "@/lib/supabase/server"

type TemplateType =
  | "booking_confirmed"
  | "pre_arrival"
  | "check_in"
  | "access_instructions"
  | "check_out"

const templateTypeSchema = z.enum([
  "booking_confirmed",
  "pre_arrival",
  "check_in",
  "access_instructions",
  "check_out",
])

const updateTemplateSchema = z.object({
  template_type: templateTypeSchema,
  content: z.string().trim().min(1).max(2000),
  is_automated: z.boolean().optional(),
  send_hours_before: z.number().int().min(0).max(720).nullable().optional(),
  access_type: z.string().trim().max(64).nullable().optional(),
  access_details: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("message_templates")
    .select("id, host_id, template_type, content, is_automated, send_hours_before, access_type, access_details")
    .eq("host_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const existing = (data ?? []) as Array<{
    id: string
    host_id: string
    template_type: TemplateType
    content: string
    is_automated: boolean
    send_hours_before: number | null
    access_type: string | null
    access_details: Record<string, unknown> | null
  }>

  const payload = TEMPLATE_TYPES.map((template) => {
    const found = existing.find((item) => item.template_type === template.type)
    return {
      id: found?.id ?? null,
      host_id: user.id,
      template_type: template.type,
      content: found?.content ?? DEFAULT_TEMPLATE_CONTENT[template.type],
      is_automated: found?.is_automated ?? template.type === "booking_confirmed",
      send_hours_before: found?.send_hours_before ?? template.send_hours_before,
      access_type: found?.access_type ?? null,
      access_details: found?.access_details ?? null,
      description: template.description,
      label: template.label,
    }
  })

  return NextResponse.json({ templates: payload })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = updateTemplateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Missing template_type or content" }, { status: 400 })
  const payload = parsed.data

  const { data, error } = await supabase
    .from("message_templates")
    .upsert(
      {
        host_id: user.id,
        template_type: payload.template_type,
        content: payload.content,
        is_automated: Boolean(payload.is_automated),
        send_hours_before: payload.send_hours_before ?? null,
        access_type: payload.access_type ?? null,
        access_details: payload.access_details ?? null,
      },
      { onConflict: "host_id,template_type" }
    )
    .select("id, host_id, template_type, content, is_automated, send_hours_before, access_type, access_details")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (payload.template_type === "check_in" || payload.template_type === "access_instructions") {
    const details = payload.access_details ?? {}
    if (payload.access_type === "lockbox") {
      const lockbox = typeof details.lockbox === "string" ? details.lockbox : null
      if (lockbox) {
        await supabase.from("listings").update({ access_instructions: lockbox }).eq("host_id", user.id)
      }
    }
    if (payload.access_type === "onsite") {
      const onsiteName = typeof details.onsite_name === "string" ? details.onsite_name : null
      const onsitePhone = typeof details.onsite_phone === "string" ? details.onsite_phone : null
      await supabase
        .from("listings")
        .update({ onsite_contact_name: onsiteName, onsite_contact_phone: onsitePhone })
        .eq("host_id", user.id)
    }
    if (payload.access_type === "key_exchange") {
      const instructions = typeof details.key_exchange === "string" ? details.key_exchange : null
      if (instructions) {
        await supabase.from("listings").update({ access_instructions: instructions }).eq("host_id", user.id)
      }
    }
  }

  return NextResponse.json({ template: data })
}
