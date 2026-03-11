import { NextRequest, NextResponse } from "next/server"

import { requireAuth } from "@/lib/auth-check"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { conversationId: string }

async function ensureAccess(conversationId: string) {
  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return { error: authError, supabase: null, userId: null, conversation: null }
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, guest_id, host_id, booking_id, listing_id")
    .eq("id", conversationId)
    .maybeSingle()

  if (conversationError) {
    return {
      error: NextResponse.json({ error: conversationError.message }, { status: 500 }),
      supabase,
      userId: null,
      conversation: null,
    }
  }
  if (!conversation || (conversation.guest_id !== session.user.id && conversation.host_id !== session.user.id)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), supabase, userId: null, conversation: null }
  }

  return { conversation, supabase, userId: session.user.id, error: null as NextResponse<unknown> | null }
}

export async function GET(_: NextRequest, { params }: { params: Promise<Params> }) {
  const { conversationId } = await params
  const access = await ensureAccess(conversationId)
  if (access.error) return access.error
  if (!access.conversation || !access.userId || !access.supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: messages, error } = await access.supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, message_type, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const otherPartyId =
    access.conversation.guest_id === access.userId ? access.conversation.host_id : access.conversation.guest_id

  const [{ data: profile }, { data: listing }, { data: booking }] = await Promise.all([
    access.supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", otherPartyId)
      .maybeSingle(),
    access.supabase
      .from("listings")
      .select("id, title")
      .eq("id", access.conversation.listing_id)
      .maybeSingle(),
    access.supabase
      .from("bookings")
      .select("id, session_date, start_time, duration_hours, access_code")
      .eq("id", access.conversation.booking_id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    conversation: access.conversation,
    other_party: profile,
    listing,
    booking,
    messages: messages ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { conversationId } = await params
  const access = await ensureAccess(conversationId)
  if (access.error) return access.error
  if (!access.conversation || !access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = createAdminClient()

  const payload = (await req.json()) as { action?: string }
  if (payload.action !== "mark_read") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  }

  const { error } = await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", access.userId)
    .is("read_at", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
