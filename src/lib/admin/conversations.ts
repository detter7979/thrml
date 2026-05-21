import type { SupabaseClient } from "@supabase/supabase-js"

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export type ResolveAdminConversationResult =
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; error: string; status: number }

export async function resolveRecipientId(
  admin: SupabaseClient,
  recipientInput: string
): Promise<string | null> {
  const trimmed = recipientInput.trim()
  if (!trimmed) return null

  if (isUuid(trimmed)) return trimmed

  const users = await admin.auth.admin.listUsers()
  const match = (users.data.users ?? []).find(
    (entry) => (entry.email ?? "").toLowerCase() === trimmed.toLowerCase()
  )
  return match?.id ?? null
}

export async function resolveAdminConversation(
  admin: SupabaseClient,
  adminUserId: string,
  recipientInput: string
): Promise<ResolveAdminConversationResult> {
  const recipientId = await resolveRecipientId(admin, recipientInput)
  if (!recipientId) {
    return { ok: false, error: "Recipient not found", status: 404 }
  }
  if (recipientId === adminUserId) {
    return { ok: false, error: "Cannot message yourself.", status: 400 }
  }

  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id, guest_id, host_id")
    .or(
      `and(guest_id.eq.${adminUserId},host_id.eq.${recipientId}),and(guest_id.eq.${recipientId},host_id.eq.${adminUserId})`
    )
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingConversation?.id) {
    return { ok: true, conversationId: existingConversation.id, created: false }
  }

  const { data: sharedBooking } = await admin
    .from("bookings")
    .select("id, listing_id, guest_id, host_id")
    .or(
      `and(guest_id.eq.${adminUserId},host_id.eq.${recipientId}),and(guest_id.eq.${recipientId},host_id.eq.${adminUserId})`
    )
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
    return {
      ok: false,
      error: "No conversation context available for this user yet.",
      status: 400,
    }
  }

  const { data: insertedConversation, error: createConversationError } = await admin
    .from("conversations")
    .insert({
      booking_id: baseBooking.id,
      listing_id: baseBooking.listing_id,
      guest_id: adminUserId,
      host_id: recipientId,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (createConversationError || !insertedConversation) {
    return {
      ok: false,
      error: createConversationError?.message ?? "Unable to create conversation.",
      status: 500,
    }
  }

  return { ok: true, conversationId: insertedConversation.id, created: true }
}
