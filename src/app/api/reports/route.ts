import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAuth } from "@/lib/auth-check"
import { resolveResendFrom, sendEmail } from "@/lib/emails/send"
import { REPORT_REASONS, REPORT_TARGET_LABEL, REPORT_TARGET_TYPES } from "@/lib/moderation/reasons"
import { moderationInbox } from "@/lib/moderation/server"
import { rateLimit } from "@/lib/rate-limit"
import { sanitizeText } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]),
  details: z.string().max(1000).optional(),
  conversationId: z.string().uuid().optional(),
})

type Resolved = { reportedUserId: string | null; conversationId: string | null; summary: string } | null

/**
 * Report a listing, review, message or person. Anyone signed in can report; the report lands in
 * /admin/reports and emails the support inbox so it can be acted on within 24 hours.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60 * 60 * 1000, identifier: "reports" })
  if (limited) return limited

  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const reporterId = session.user.id

  const parsed = reportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 })
  const { targetType, targetId, reason } = parsed.data
  const details = parsed.data.details ? sanitizeText(parsed.data.details).slice(0, 1000) : null

  const admin = createAdminClient()
  let resolved: Resolved = null

  if (targetType === "listing") {
    const { data } = await admin.from("listings").select("id, host_id, title").eq("id", targetId).maybeSingle()
    if (data) resolved = { reportedUserId: data.host_id, conversationId: null, summary: `Listing "${data.title ?? data.id}"` }
  } else if (targetType === "review") {
    const { data } = await admin.from("reviews").select("id, reviewer_id, listing_id").eq("id", targetId).maybeSingle()
    if (data) resolved = { reportedUserId: data.reviewer_id, conversationId: null, summary: `Review on listing ${data.listing_id}` }
  } else if (targetType === "message") {
    const { data } = await admin
      .from("messages")
      .select("id, sender_id, conversation_id, conversations!inner(guest_id, host_id)")
      .eq("id", targetId)
      .maybeSingle()
    const convo = (data?.conversations ?? null) as { guest_id: string; host_id: string } | null
    // Only people in the conversation can report its messages.
    if (data && convo && (convo.guest_id === reporterId || convo.host_id === reporterId)) {
      resolved = { reportedUserId: data.sender_id, conversationId: data.conversation_id, summary: "Message in a conversation" }
    }
  } else {
    const { data } = await admin.from("profiles").select("id, full_name").eq("id", targetId).maybeSingle()
    if (data) {
      let conversationId: string | null = null
      if (parsed.data.conversationId) {
        const { data: convo } = await admin
          .from("conversations")
          .select("id, guest_id, host_id")
          .eq("id", parsed.data.conversationId)
          .maybeSingle()
        if (convo && (convo.guest_id === reporterId || convo.host_id === reporterId)) conversationId = convo.id
      }
      resolved = { reportedUserId: data.id, conversationId, summary: `Person: ${data.full_name ?? data.id}` }
    }
  }

  if (!resolved) return NextResponse.json({ error: "We couldn't find that item." }, { status: 404 })
  if (resolved.reportedUserId === reporterId) {
    return NextResponse.json({ error: "You can't report your own content." }, { status: 400 })
  }

  const { data: report, error: insertError } = await admin
    .from("content_reports")
    .insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reported_user_id: resolved.reportedUserId,
      conversation_id: resolved.conversationId,
      reason,
      details,
    })
    .select("id")
    .single()

  // Already reported and still open: treat as success so the person isn't told to try again.
  if (insertError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true })
  if (insertError || !report) return NextResponse.json({ error: "Could not send your report." }, { status: 500 })

  const inbox = moderationInbox()
  if (inbox) {
    const reasonLabel = REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason
    const lines = [
      `New ${REPORT_TARGET_LABEL[targetType]} report: ${reasonLabel}`,
      resolved.summary,
      details ? `Details: ${details}` : "No details given.",
      "Review it within 24 hours: https://usethrml.com/admin/reports",
    ]
    await sendEmail({
      to: inbox,
      from: resolveResendFrom(),
      replyTo: null,
      subject: `[Report] ${reasonLabel}: ${REPORT_TARGET_LABEL[targetType]}`,
      text: lines.join("\n\n"),
      html: lines.map((line) => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
