import { createAdminClient } from "@/lib/supabase/admin"

type TemplateType =
  | "booking_confirmed"
  | "pre_arrival"
  | "check_in"
  | "access_instructions"
  | "check_out"

type BookingRow = {
  id: string
  guest_id: string
  host_id: string
  listing_id: string
  session_date: string | null
  start_time: string | null
  duration_hours: number | null
  access_code: string | null
  automated_messages_sent: string[] | null
}

type ListingRow = {
  id: string
  title: string | null
  location_address: string | null
  access_type: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type MessageTemplateRow = {
  id: string
  host_id: string
  template_type: TemplateType
  content: string
  is_automated: boolean
  send_hours_before: number | null
  access_type: string | null
  access_details: Record<string, unknown> | null
}

export const TEMPLATE_TYPES: Array<{
  type: TemplateType
  label: string
  description: string
  send_hours_before: number | null
}> = [
  {
    type: "booking_confirmed",
    label: "Booking Confirmed",
    description: "Sent immediately when payment is confirmed",
    send_hours_before: null,
  },
  {
    type: "pre_arrival",
    label: "Pre-arrival",
    description: "Sent 24 hours before the session",
    send_hours_before: 24,
  },
  {
    type: "check_in",
    label: "Check-in",
    description: "Sent 1 hour before the session with access details",
    send_hours_before: 1,
  },
  {
    type: "access_instructions",
    label: "Access Instructions",
    description: "Contains your access code or entry details",
    send_hours_before: 1,
  },
  {
    type: "check_out",
    label: "Check-out",
    description: "Sent after the session ends",
    send_hours_before: -1,
  },
]

export const DEFAULT_TEMPLATE_CONTENT: Record<TemplateType, string> = {
  booking_confirmed:
    "Hi {guest_name}! Thanks for booking {listing_title}. I'm looking forward to hosting you on {date} at {time}. Feel free to message me here if you have any questions before your session.",
  pre_arrival:
    "Hi {guest_name}! Your session at {listing_title} is coming up on {date} at {time}. Reach out if you need anything before arrival.",
  check_in:
    "Hi {guest_name}, your session starts in about an hour. {address}. Your access code is {access_code}.",
  access_instructions:
    "Access details for {listing_title}: {address}. Use code {access_code} when you arrive.",
  check_out:
    "Thanks for visiting {listing_title}, {guest_name}. Hope your session was restorative. Safe travels home.",
}

function firstName(fullName: string | null | undefined) {
  if (!fullName) return "there"
  return fullName.split(" ")[0] || "there"
}

function formatDateLabel(sessionDate: string | null) {
  if (!sessionDate) return "your session date"
  return new Date(`${sessionDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatTimeLabel(sessionDate: string | null, startTime: string | null) {
  if (!sessionDate || !startTime) return "your scheduled time"
  const parsed = new Date(`${sessionDate}T${startTime}`)
  if (Number.isNaN(parsed.getTime())) return "your scheduled time"
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function formatTemplate(
  content: string,
  values: {
    guest_name: string
    listing_title: string
    date: string
    time: string
    duration: string
    access_code: string
    host_name: string
    address: string
  }
) {
  return content.replace(/\{(guest_name|listing_title|date|time|duration|access_code|host_name|address)\}/g, (_, key) => {
    return values[key as keyof typeof values] ?? ""
  })
}

function isCodeAccessType(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "code"
}

export async function getOrCreateConversationForBooking(booking: {
  id: string
  listing_id: string
  guest_id: string
  host_id: string
}) {
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      booking_id: booking.id,
      listing_id: booking.listing_id,
      guest_id: booking.guest_id,
      host_id: booking.host_id,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

export async function sendAutomatedBookingConfirmedMessage(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
}) {
  const supabase = createAdminClient()
  const conversationId = await getOrCreateConversationForBooking({
    id: params.bookingId,
    listing_id: params.listingId,
    guest_id: params.guestId,
    host_id: params.hostId,
  })

  const { data: existingBookingConfirmedMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("message_type", "automated_booking_confirmed")
    .maybeSingle()

  if (existingBookingConfirmedMessage?.id) {
    return conversationId
  }

  const [{ data: booking }, { data: listing }, { data: guest }, { data: host }, { data: template }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, session_date, start_time, duration_hours, access_code")
      .eq("id", params.bookingId)
      .maybeSingle(),
    supabase.from("listings").select("id, title, location_address, access_type").eq("id", params.listingId).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("id", params.guestId).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("id", params.hostId).maybeSingle(),
    supabase
      .from("message_templates")
      .select("template_type, content")
      .eq("host_id", params.hostId)
      .eq("template_type", "booking_confirmed")
      .maybeSingle(),
  ])

  const bookingRecord = booking as Pick<BookingRow, "session_date" | "start_time" | "duration_hours" | "access_code"> | null
  const listingRecord = listing as ListingRow | null
  const guestRecord = guest as ProfileRow | null
  const hostRecord = host as ProfileRow | null
  const templateContent =
    (template as { content?: string } | null)?.content ?? DEFAULT_TEMPLATE_CONTENT.booking_confirmed

  const body = formatTemplate(templateContent, {
    guest_name: firstName(guestRecord?.full_name),
    listing_title: listingRecord?.title ?? "your session",
    date: formatDateLabel(bookingRecord?.session_date ?? null),
    time: formatTimeLabel(bookingRecord?.session_date ?? null, bookingRecord?.start_time ?? null),
    duration: `${bookingRecord?.duration_hours ?? 1}h`,
    access_code: isCodeAccessType(listingRecord?.access_type) ? bookingRecord?.access_code ?? "shared before arrival" : "provided by your host",
    host_name: firstName(hostRecord?.full_name),
    address: listingRecord?.location_address ?? "Address shared after booking",
  })

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: params.hostId,
    body,
    content: body,
    message_type: "automated_booking_confirmed",
  })

  if (messageError) throw new Error(messageError.message)

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
  return conversationId
}

async function sendAutomatedSystemMessage(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
  messageType: string
  body: string
}) {
  const supabase = createAdminClient()
  const conversationId = await getOrCreateConversationForBooking({
    id: params.bookingId,
    listing_id: params.listingId,
    guest_id: params.guestId,
    host_id: params.hostId,
  })

  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("message_type", params.messageType)
    .maybeSingle()

  if (existing?.id) return conversationId

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    // Keep sender_id valid for existing FK constraints while rendering as automated system copy.
    sender_id: params.hostId,
    body: params.body,
    content: params.body,
    message_type: params.messageType,
  })
  if (messageError) throw new Error(messageError.message)

  await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
  return conversationId
}

export async function sendAutomatedBookingRequestSentMessage(params: {
  bookingId: string
  listingId: string
  listingTitle: string
  guestId: string
  hostId: string
  hostName: string
  sessionDateLabel: string
}) {
  return sendAutomatedSystemMessage({
    bookingId: params.bookingId,
    listingId: params.listingId,
    guestId: params.guestId,
    hostId: params.hostId,
    messageType: "automated_booking_request_sent",
    body: `Your booking request for ${params.listingTitle} on ${params.sessionDateLabel} has been sent to ${params.hostName}. You'll be notified once they respond.`,
  })
}

export async function sendAutomatedBookingConfirmedByHostMessage(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
  hostName: string
}) {
  return sendAutomatedSystemMessage({
    bookingId: params.bookingId,
    listingId: params.listingId,
    guestId: params.guestId,
    hostId: params.hostId,
    messageType: "automated_booking_host_confirmed",
    body: `✓ Your booking has been confirmed by ${params.hostName}. See your booking details for access information.`,
  })
}

export async function sendAutomatedBookingDeclinedMessage(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
  hostName: string
}) {
  return sendAutomatedSystemMessage({
    bookingId: params.bookingId,
    listingId: params.listingId,
    guestId: params.guestId,
    hostId: params.hostId,
    messageType: "automated_booking_host_declined",
    body: `Your booking request was declined by ${params.hostName}. Your card has not been charged.`,
  })
}

export async function sendAutomatedBookingExpiredMessage(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
  hostName: string
}) {
  return sendAutomatedSystemMessage({
    bookingId: params.bookingId,
    listingId: params.listingId,
    guestId: params.guestId,
    hostId: params.hostId,
    messageType: "automated_booking_request_expired",
    body: `Your booking request expired before ${params.hostName} responded. No charge was made.`,
  })
}

function getSessionStart(booking: BookingRow) {
  if (!booking.session_date || !booking.start_time) return null
  const parsed = new Date(`${booking.session_date}T${booking.start_time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getThresholdDate(booking: BookingRow, sendHoursBefore: number | null) {
  const start = getSessionStart(booking)
  if (!start) return null
  if (sendHoursBefore === null) return start
  return new Date(start.getTime() - sendHoursBefore * 60 * 60 * 1000)
}

export async function processScheduledMessages() {
  const supabase = createAdminClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: bookingsRaw, error: bookingError } = await supabase
    .from("bookings")
    .select("id, guest_id, host_id, listing_id, session_date, start_time, duration_hours, access_code, automated_messages_sent, status")
    .eq("status", "confirmed")
    .gte("session_date", windowStart.slice(0, 10))
    .lte("session_date", windowEnd.slice(0, 10))

  if (bookingError) throw new Error(bookingError.message)
  const bookings = (bookingsRaw ?? []) as BookingRow[]
  if (!bookings.length) return { sent: 0 }

  const hostIds = Array.from(new Set(bookings.map((item) => item.host_id)))
  const listingIds = Array.from(new Set(bookings.map((item) => item.listing_id)))
  const guestIds = Array.from(new Set(bookings.map((item) => item.guest_id)))

  const [{ data: templatesRaw }, { data: listingsRaw }, { data: guestsRaw }, { data: hostsRaw }, { data: conversationsRaw }] =
    await Promise.all([
      supabase
        .from("message_templates")
        .select("id, host_id, template_type, content, is_automated, send_hours_before, access_type, access_details")
        .in("host_id", hostIds),
      supabase.from("listings").select("id, title, location_address, access_type").in("id", listingIds),
      supabase.from("profiles").select("id, full_name").in("id", guestIds),
      supabase.from("profiles").select("id, full_name").in("id", hostIds),
      supabase.from("conversations").select("id, booking_id").in("booking_id", bookings.map((b) => b.id)),
    ])

  const templates = (templatesRaw ?? []) as MessageTemplateRow[]
  const listingMap = new Map((listingsRaw ?? []).map((row) => [row.id as string, row as ListingRow]))
  const guestMap = new Map((guestsRaw ?? []).map((row) => [row.id as string, row as ProfileRow]))
  const hostMap = new Map((hostsRaw ?? []).map((row) => [row.id as string, row as ProfileRow]))
  const conversationByBooking = new Map((conversationsRaw ?? []).map((row) => [row.booking_id as string, row.id as string]))
  const templatesByHost = new Map<string, Map<TemplateType, MessageTemplateRow>>()

  for (const templateType of TEMPLATE_TYPES) {
    for (const hostId of hostIds) {
      const perHost = templatesByHost.get(hostId) ?? new Map<TemplateType, MessageTemplateRow>()
      const existing = templates.find((row) => row.host_id === hostId && row.template_type === templateType.type)
      if (existing) {
        perHost.set(templateType.type, existing)
      } else {
        perHost.set(templateType.type, {
          id: "",
          host_id: hostId,
          template_type: templateType.type,
          content: DEFAULT_TEMPLATE_CONTENT[templateType.type],
          is_automated: templateType.type === "booking_confirmed",
          send_hours_before: templateType.send_hours_before,
          access_type: null,
          access_details: null,
        })
      }
      templatesByHost.set(hostId, perHost)
    }
  }

  let sent = 0

  for (const booking of bookings) {
    const hostTemplates = templatesByHost.get(booking.host_id)
    if (!hostTemplates) continue

    let conversationId = conversationByBooking.get(booking.id)
    if (!conversationId) {
      conversationId = await getOrCreateConversationForBooking({
        id: booking.id,
        listing_id: booking.listing_id,
        guest_id: booking.guest_id,
        host_id: booking.host_id,
      })
      conversationByBooking.set(booking.id, conversationId)
    }

    const alreadySent = new Set(booking.automated_messages_sent ?? [])
    const listing = listingMap.get(booking.listing_id)
    const guest = guestMap.get(booking.guest_id)
    const host = hostMap.get(booking.host_id)

    for (const templateType of TEMPLATE_TYPES) {
      if (templateType.type === "booking_confirmed") continue
      const template = hostTemplates.get(templateType.type)
      if (!template || !template.is_automated) continue
      if (alreadySent.has(templateType.type)) continue

      const threshold = getThresholdDate(booking, template.send_hours_before)
      if (!threshold) continue
      if (threshold.getTime() > now.getTime()) continue

      const body = formatTemplate(template.content || DEFAULT_TEMPLATE_CONTENT[templateType.type], {
        guest_name: firstName(guest?.full_name),
        listing_title: listing?.title ?? "your session",
        date: formatDateLabel(booking.session_date),
        time: formatTimeLabel(booking.session_date, booking.start_time),
        duration: `${booking.duration_hours ?? 1}h`,
        access_code: isCodeAccessType(listing?.access_type) ? booking.access_code ?? "shared before arrival" : "provided by your host",
        host_name: firstName(host?.full_name),
        address: listing?.location_address ?? "Address shared in booking details",
      })

      const messageType = `automated_${templateType.type}`
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: booking.host_id,
        body,
        content: body,
        message_type: messageType,
      })
      if (messageError) continue

      alreadySent.add(templateType.type)
      sent += 1
      await supabase
        .from("bookings")
        .update({ automated_messages_sent: Array.from(alreadySent) })
        .eq("id", booking.id)
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
    }
  }

  return { sent }
}
