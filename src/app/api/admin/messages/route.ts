import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { resolveAdminConversation } from "@/lib/admin/conversations"
import { requireAdminApi } from "@/lib/admin-guard"
import { sanitizeText } from "@/lib/sanitize"

const payloadSchema = z.object({
  recipient: z.string().trim().min(1),
  subject: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const result = await resolveAdminConversation(admin, user.id, parsed.data.recipient)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const bodyText = sanitizeText(parsed.data.body)
  if (!bodyText) return NextResponse.json({ error: "Message body is invalid." }, { status: 400 })
  const messageBody = parsed.data.subject ? `[${parsed.data.subject}] ${bodyText}` : bodyText

  const { error: messageError } = await admin.from("messages").insert({
    conversation_id: result.conversationId,
    sender_id: user.id,
    body: messageBody,
    content: messageBody,
    message_type: "text",
  })
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", result.conversationId)
  return NextResponse.json({ success: true, conversationId: result.conversationId })
}
