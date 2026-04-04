import { sendEmail } from "@/lib/emails/send"
import { ACCESS_TYPES, resolveInstructions } from "@/lib/constants/access-types"
import { resolveHouseRules } from "@/lib/constants/default-house-rules"
import { createAdminClient } from "@/lib/supabase/admin"

type BookingForAccess = {
  id: string
  guest_id: string
  host_id: string
  listing_id: string
  session_date: string | null
  start_time: string | null
  duration_hours: number | null
  access_code: string | null
  access_code_sent_at?: string | null
}

type ListingForAccess = {
  id: string
  host_id: string
  title: string | null
  access_type: string | null
  access_code_template: string | null
  access_instructions: string | null
  access_code_send_timing: string | null
  house_rules?: string[] | null
  house_rules_custom?: string | null
}

type ProfileForAccess = {
  id: string
  full_name: string | null
}

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

function firstName(fullName: string | null | undefined, fallback = "there") {
  const normalized = (fullName ?? "").trim()
  if (!normalized) return fallback
  return normalized.split(" ")[0] ?? fallback
}

function formatDate(date: string | null) {
  if (!date) return "your session date"
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return "your session date"
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

function formatTime(date: string | null, time: string | null) {
  if (!date || !time) return "your session time"
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return "your session time"
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function formatDuration(durationHours: number | null) {
  const hours = Number(durationHours ?? 1)
  if (!Number.isFinite(hours) || hours <= 0) return "60 minutes"
  const minutes = Math.round(hours * 60)
  return `${minutes} minutes`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

async function ensureConversationId(params: {
  bookingId: string
  listingId: string
  guestId: string
  hostId: string
}) {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", params.bookingId)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data, error } = await admin
    .from("conversations")
    .insert({
      booking_id: params.bookingId,
      listing_id: params.listingId,
      guest_id: params.guestId,
      host_id: params.hostId,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

export async function sendAccessCode(
  bookingId: string
): Promise<{ sent: boolean; error?: string }> {
  try {
    const admin = createAdminClient()
    const bookingSelectCandidates = [
      "id, guest_id, host_id, listing_id, session_date, start_time, duration_hours, access_code, access_code_sent_at",
      "id, guest_id, host_id, listing_id, session_date, start_time, duration_hours, access_code",
    ] as const
    let bookingRaw: Record<string, unknown> | null = null
    let bookingError: string | null = null
    for (const select of bookingSelectCandidates) {
      const attempt = await admin.from("bookings").select(select).eq("id", bookingId).maybeSingle()
      if (!attempt.error) {
        bookingRaw = attempt.data as Record<string, unknown> | null
        bookingError = null
        break
      }
      bookingError = attempt.error.message
      if (!isMissingColumnError(attempt.error.message)) break
    }
    if (bookingError || !bookingRaw) {
      return { sent: false, error: bookingError ?? "Booking not found" }
    }

    const booking = bookingRaw as BookingForAccess

    const [listingResult, { data: guestProfile }, { data: hostProfile }, guestAuth] =
      await Promise.all([
        (async () => {
          const listingSelectCandidates = [
            "id, host_id, title, access_type, access_code_template, access_instructions, access_code_send_timing, house_rules, house_rules_custom",
            "id, host_id, title, access_type, access_code_template, access_instructions, access_code_send_timing, house_rules",
            "id, host_id, title, access_type, access_code_template, access_instructions, access_code_send_timing",
          ] as const
          let data: Record<string, unknown> | null = null
          let error: string | null = null
          for (const select of listingSelectCandidates) {
            const attempt = await admin.from("listings").select(select).eq("id", booking.listing_id).maybeSingle()
            if (!attempt.error) {
              data = attempt.data as Record<string, unknown> | null
              error = null
              break
            }
            error = attempt.error.message
            if (!isMissingColumnError(attempt.error.message)) break
          }
          return { data, error }
        })(),
        admin.from("profiles").select("id, full_name").eq("id", booking.guest_id).maybeSingle(),
        admin.from("profiles").select("id, full_name").eq("id", booking.host_id).maybeSingle(),
        admin.auth.admin.getUserById(booking.guest_id),
      ])

    const listing = listingResult.data as ListingForAccess | null
    if (listingResult.error || !listing) return { sent: false, error: listingResult.error ?? "Listing not found" }

    const accessTypeKey = (listing.access_type ?? "code") as keyof typeof ACCESS_TYPES
    const accessConfig = ACCESS_TYPES[accessTypeKey] ?? ACCESS_TYPES.code
    const resolvedCode = booking.access_code ?? listing.access_code_template ?? null

    if (accessConfig.supportsCode && !resolvedCode) {
      console.warn("[access-code] no code configured", { bookingId, listingId: listing.id })
      return { sent: false, error: "No code configured" }
    }

    const guest = guestProfile as ProfileForAccess | null
    const host = hostProfile as ProfileForAccess | null
    const guestEmail = guestAuth.data.user?.email ?? null
    if (!guestEmail) return { sent: false, error: "Guest email missing" }

    const dateLabel = formatDate(booking.session_date)
    const timeLabel = formatTime(booking.session_date, booking.start_time)
    const guestFirstName = firstName(guest?.full_name)
    const hostFirstName = firstName(host?.full_name, "your host")
    const durationLabel = formatDuration(booking.duration_hours)

    const instructionsTemplate = listing.access_instructions?.trim() || "Your host will share access details."
    const resolvedInstructions = resolveInstructions(instructionsTemplate, {
      code: resolvedCode,
      date: dateLabel,
      time: timeLabel,
      guestName: guestFirstName,
      duration: durationLabel,
    })
    const { rules, custom, isDefault } = resolveHouseRules(
      Array.isArray(listing.house_rules) ? listing.house_rules : null,
      listing.house_rules_custom ?? null
    )
    const bookingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/bookings/${booking.id}`
    const wasAlreadySent = Boolean(booking.access_code_sent_at)
    const subject = `Your access details — ${listing.title ?? "your booking"} on ${dateLabel}`
    const rulesHtml = rules
      .map(
        (rule) => `
          <div style="padding:8px 0;border-bottom:1px solid #F0E8E0;font-size:14px;color:#2C2420;display:flex;gap:10px;align-items:flex-start;">
            <span style="color:#8B4513;line-height:1.4;">●</span>
            <span>${escapeHtml(rule)}</span>
          </div>
        `
      )
      .join("")
    const customHtml = custom
      ? `
          <div style="background:#F5EFE9;border-radius:6px;padding:12px;font-size:13px;color:#4A3728;margin-top:12px;">
            <p style="margin:0 0 6px;font-weight:600;">Additional notes from your host:</p>
            <p style="margin:0;line-height:1.5;">${escapeHtml(custom).replace(/\n/g, "<br/>")}</p>
          </div>
        `
      : ""
    const defaultRulesNote = isDefault
      ? `<p style="font-size:11px;color:#A89880;text-align:center;margin-top:8px;">Standard Thrml community rules</p>`
      : ""
    const html = `
      <div style="margin:0;padding:28px 12px;background:#F7F3EE;">
        <div style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #E5DDD6;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;color:#1F1914;">
          <div style="padding:18px 24px;border-bottom:1px solid #EFE5DA;background:#FFF9F2;">
            <div style="font-size:22px;font-weight:700;letter-spacing:0.4px;">Thrml</div>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 10px;">Hi ${guestFirstName},</p>
            <p style="margin:0 0 14px;">Here are your access details for your upcoming session.</p>
            <p style="margin:0 0 4px;font-weight:700;">${listing.title ?? "Your booking"}</p>
            <p style="margin:0 0 14px;color:#6A5848;">${dateLabel} · ${timeLabel} · ${durationLabel}</p>
            <hr style="border:none;border-top:1px solid #EFE5DA;margin:14px 0;" />
      ${
        accessConfig.supportsCode && resolvedCode
          ? `<p style="font-size:12px;letter-spacing:0.12em;color:#6D5E51;text-transform:uppercase;margin:0 0 6px;">Your access code</p>
             <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:0.22em;background:#F5EFE9;border:1px solid #E5DDD6;border-radius:8px;padding:14px 16px;display:inline-block;">
               ${resolvedCode.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
             </div>
             <p style="margin:6px 0 0;color:#7A6A5D;">(tap to copy)</p>
             <hr style="border:none;border-top:1px solid #EFE5DA;margin:14px 0;" />`
          : ""
      }
            <p style="font-size:12px;letter-spacing:0.12em;color:#6D5E51;text-transform:uppercase;margin:0 0 6px;">How to get in</p>
            <p style="margin:0 0 14px;line-height:1.6;">${resolvedInstructions.replace(/\n/g, "<br/>")}</p>
            <hr style="border:none;border-top:1px solid #EFE5DA;margin:14px 0;" />
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6D5E51;margin:0 0 12px;">House rules</p>
            ${rulesHtml}
            ${customHtml}
            ${defaultRulesNote}
            <hr style="border:none;border-top:1px solid #EFE5DA;margin:14px 0;" />
            <p style="margin:0 0 12px;">
              <a href="${bookingUrl}" style="display:inline-block;background:#C75B3A;color:#FFFFFF;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700;">View booking details →</a>
            </p>
            <p style="margin:0;color:#6A5848;">Having trouble? Message ${hostFirstName} directly in the app.</p>
            <p style="margin:16px 0 0;color:#77685B;font-size:12px;">Thrml · usethermal.com</p>
          </div>
        </div>
      </div>
    `
    const text = [
      `Hi ${guestFirstName},`,
      "",
      "Here are your access details for your upcoming session.",
      `${listing.title ?? "Your booking"}`,
      `${dateLabel} · ${timeLabel} · ${durationLabel}`,
      accessConfig.supportsCode && resolvedCode ? `Your access code: ${resolvedCode}` : null,
      "",
      `Entry instructions: ${resolvedInstructions}`,
      "",
      "HOUSE RULES",
      ...rules.map((rule, index) => `${index + 1}. ${rule}`),
      custom ? "" : null,
      custom ? `Additional notes: ${custom}` : null,
      "",
      `View booking: ${bookingUrl}`,
      `Questions? Message ${hostFirstName} directly in the app.`,
    ]
      .filter(Boolean)
      .join("\n")

    const emailResult = await sendEmail({
      to: guestEmail,
      subject,
      html,
      text,
      userId: booking.guest_id,
      preferenceKey: "new_booking",
    })
    if (!emailResult.sent) return { sent: false, error: emailResult.error ?? "Email send failed" }

    if (!wasAlreadySent) {
      const conversationId = await ensureConversationId({
        bookingId: booking.id,
        listingId: booking.listing_id,
        guestId: booking.guest_id,
        hostId: booking.host_id,
      })

      const messageRules = rules.slice(0, 5)
      const hasOverflowRules = rules.length > 5
      const messageParts = [
        resolvedInstructions,
        "",
        "House rules:",
        ...messageRules.map((rule) => `• ${rule}`),
        custom ? "" : null,
        custom ?? null,
        hasOverflowRules ? `View all rules on your booking page: ${bookingUrl}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n")
      const baseMessage = {
        conversation_id: conversationId,
        sender_id: booking.host_id,
        body: messageParts,
        content: messageParts,
        message_type: "automated_access_instructions",
        is_automated: true,
      }
      const insertAttempt = await admin.from("messages").insert(baseMessage)
      if (insertAttempt.error && insertAttempt.error.message.toLowerCase().includes("column")) {
        const fallbackAttempt = await admin.from("messages").insert({
          conversation_id: conversationId,
          sender_id: booking.host_id,
          body: `[System] ${messageParts}`,
          content: `[System] ${messageParts}`,
          message_type: "automated_access_instructions",
        })
        if (fallbackAttempt.error) {
          return { sent: false, error: fallbackAttempt.error.message }
        }
      } else if (insertAttempt.error) {
        return { sent: false, error: insertAttempt.error.message }
      }
      await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId)
    }
    const sentAtIso = new Date().toISOString()
    const updateSent = await admin
      .from("bookings")
      .update({ access_code_sent: true, access_code_sent_at: sentAtIso })
      .eq("id", booking.id)
    if (updateSent.error) {
      if (!isMissingColumnError(updateSent.error.message)) {
        return { sent: false, error: updateSent.error.message }
      }
      const updateSentAtOnly = await admin
        .from("bookings")
        .update({ access_code_sent_at: sentAtIso })
        .eq("id", booking.id)
      if (updateSentAtOnly.error && !isMissingColumnError(updateSentAtOnly.error.message)) {
        return { sent: false, error: updateSentAtOnly.error.message }
      }
    }

    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

