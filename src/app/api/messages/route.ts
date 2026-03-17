import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"

const messageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  messageType: z.enum(["text"]).optional(),
})

export async function GET(req: NextRequest) {
  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId")
  if (!conversationId) return NextResponse.json({ error: "Missing conversationId" }, { status: 400 })

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, guest_id, host_id")
    .eq("id", conversationId)
    .maybeSingle()

  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 })
  if (!conversation || (conversation.guest_id !== session.user.id && conversation.host_id !== session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, message_type, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })
  return NextResponse.json({ messages: messages ?? [] })
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    identifier: "messages",
  })
  if (limited) return limited

  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()

  const parsed = messageSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  const conversationId = parsed.data.conversationId
  const body = sanitizeText(parsed.data.body)
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  const messageType = parsed.data.messageType ?? "text"

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, guest_id, host_id")
    .eq("id", conversationId)
    .maybeSingle()

  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 })
  if (!conversation || (conversation.guest_id !== session.user.id && conversation.host_id !== session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: session.user.id,
      body,
      content: body,
      message_type: messageType,
    })
    .select("id, conversation_id, sender_id, body, message_type, created_at, read_at")
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)

  return NextResponse.json({ message }, { status: 201 })
}
