import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"
import { sanitizeText } from "@/lib/sanitize"

const payloadSchema = z.object({
  recipient: z.string().trim().min(1),
  subject: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(1).max(2000),
})

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const recipientInput = parsed.data.recipient.trim()
  let recipientId: string | null = null

  if (isUuid(recipientInput)) {
    recipientId = recipientInput
  } else {
    const users = await admin.auth.admin.listUsers()
    const match = (users.data.users ?? []).find(
      (entry) => (entry.email ?? "").toLowerCase() === recipientInput.toLowerCase()
    )
    recipientId = match?.id ?? null
  }

  if (!recipientId) return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
  if (recipientId === user.id) return NextResponse.json({ error: "Cannot message yourself." }, { status: 400 })

  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id, guest_id, host_id")
    .or(`and(guest_id.eq.${user.id},host_id.eq.${recipientId}),and(guest_id.eq.${recipientId},host_id.eq.${user.id})`)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId = existingConversation?.id ?? null
  if (!conversationId) {
    const { data: sharedBooking } = await admin
      .from("bookings")
      .select("id, listing_id, guest_id, host_id")
      .or(`and(guest_id.eq.${user.id},host_id.eq.${recipientId}),and(guest_id.eq.${recipientId},host_id.eq.${user.id})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: fallbackRecipientBooking } = sharedBooking
      ? { data: null }
      : await admin
          .from("bookings")
          .select("id, listing_id, guest_id, host_id")
          .or(`guest_id.eq.${recipientId},host_id.eq.${recipientId}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

    const baseBooking = sharedBooking ?? fallbackRecipientBooking
    if (!baseBooking?.id || !baseBooking?.listing_id) {
      return NextResponse.json(
        { error: "No conversation context available for this user yet." },
        { status: 400 }
      )
    }

    const { data: insertedConversation, error: createConversationError } = await admin
      .from("conversations")
      .insert({
        booking_id: baseBooking.id,
        listing_id: baseBooking.listing_id,
        guest_id: user.id,
        host_id: recipientId,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (createConversationError || !insertedConversation) {
      return NextResponse.json(
        { error: createConversationError?.message ?? "Unable to create conversation." },
        { status: 500 }
      )
    }
    conversationId = insertedConversation.id
  }

  const bodyText = sanitizeText(parsed.data.body)
  if (!bodyText) return NextResponse.json({ error: "Message body is invalid." }, { status: 400 })
  const messageBody = parsed.data.subject ? `[${parsed.data.subject}] ${bodyText}` : bodyText

  const { error: messageError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: messageBody,
    content: messageBody,
    message_type: "text",
  })
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })

  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
  return NextResponse.json({ success: true, conversationId })
}
