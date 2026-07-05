import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = THRML_APP_URL

const DAY_MS = 24 * 60 * 60 * 1000
const FOLLOWUP_AFTER_MS = 2 * DAY_MS
const FOLLOWUP_MAX_AGE_MS = 14 * DAY_MS

type SupportRequestRow = {
  id: string
  name: string | null
  email: string | null
  subject: string | null
  ticket_number: string | null
  status: string | null
  created_at: string
  followup_email_sent_at: string | null
  escalation_email_sent_at: string | null
}

function displayName(name: string | null): string {
  const trimmed = (name ?? "").trim()
  return trimmed ? (trimmed.split(/\s+/)[0] ?? trimmed) : "there"
}

/** "We're still on it" — sent once when a ticket stays open past 48h. */
export async function sendSupportPendingFollowUp(row: SupportRequestRow): Promise<boolean> {
  if (!row.email) return false
  const ticket = row.ticket_number ?? row.id.slice(0, 8).toUpperCase()

  const result = await sendThrmlLayoutEmail({
    to: row.email,
    subject: `Still on it — ${ticket}`,
    layout: {
      preview: `Your support request ${ticket} is still being worked on`,
      kicker: "Support update",
      title: "We haven't forgotten about you.",
      greeting: `Hi ${displayName(row.name)},`,
      paragraphs: [
        `Your request (${ticket}${row.subject ? ` — ${row.subject}` : ""}) is still open with our team.`,
        "Some requests take a little longer to resolve properly — especially anything involving payments or bookings. You don't need to do anything; we'll follow up as soon as there's an update.",
        "If anything has changed on your end, just reply to this email and it will be added to your ticket.",
      ],
      cta: { label: "Visit Support Center", href: `${APP_URL}/support` },
    },
  })

  return result.sent
}

/** Sent once when a ticket is escalated to senior/human review. */
export async function sendSupportEscalatedEmail(row: SupportRequestRow): Promise<boolean> {
  if (!row.email) return false
  const ticket = row.ticket_number ?? row.id.slice(0, 8).toUpperCase()

  const result = await sendThrmlLayoutEmail({
    to: row.email,
    subject: `Your request has been escalated — ${ticket}`,
    layout: {
      preview: `Ticket ${ticket} has been escalated for senior review`,
      kicker: "Support update",
      title: "Your request is getting extra attention.",
      greeting: `Hi ${displayName(row.name)},`,
      paragraphs: [
        `We've escalated your request (${ticket}${row.subject ? ` — ${row.subject}` : ""}) to a senior member of our team.`,
        "This usually means your case needs a closer look — a payment review, a policy decision, or coordination with a host. Escalated requests are prioritized and reviewed by a person, not an automated system.",
        "We'll email you directly with the outcome. Reply anytime to add context.",
      ],
      cta: { label: "Visit Support Center", href: `${APP_URL}/support` },
    },
  })

  return result.sent
}

/**
 * Daily cron: pending follow-ups for tickets open > 48h, and escalation
 * notices for tickets marked escalated. Each fires at most once per ticket.
 */
export async function processSupportFollowUps(): Promise<{ followups: number; escalations: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const openBefore = new Date(now.getTime() - FOLLOWUP_AFTER_MS).toISOString()
  const openAfter = new Date(now.getTime() - FOLLOWUP_MAX_AGE_MS).toISOString()
  let followups = 0
  let escalations = 0

  const { data: pendingRaw, error: pendingError } = await admin
    .from("support_requests")
    .select("id, name, email, subject, ticket_number, status, created_at, followup_email_sent_at, escalation_email_sent_at")
    .in("status", ["open", "pending", "in_progress"])
    .is("followup_email_sent_at", null)
    .gte("created_at", openAfter)
    .lte("created_at", openBefore)

  if (pendingError) {
    console.error("[emails/support-followups] pending query failed", pendingError.message)
  }

  for (const row of (pendingRaw ?? []) as SupportRequestRow[]) {
    try {
      if (await sendSupportPendingFollowUp(row)) {
        await admin
          .from("support_requests")
          .update({ followup_email_sent_at: now.toISOString() })
          .eq("id", row.id)
        followups++
      }
    } catch (error) {
      console.error("[emails/support-followups] follow-up failed", { id: row.id, error })
    }
  }

  const { data: escalatedRaw, error: escalatedError } = await admin
    .from("support_requests")
    .select("id, name, email, subject, ticket_number, status, created_at, followup_email_sent_at, escalation_email_sent_at")
    .eq("status", "escalated")
    .is("escalation_email_sent_at", null)

  if (escalatedError) {
    console.error("[emails/support-followups] escalated query failed", escalatedError.message)
  }

  for (const row of (escalatedRaw ?? []) as SupportRequestRow[]) {
    try {
      if (await sendSupportEscalatedEmail(row)) {
        await admin
          .from("support_requests")
          .update({ escalation_email_sent_at: now.toISOString() })
          .eq("id", row.id)
        escalations++
      }
    } catch (error) {
      console.error("[emails/support-followups] escalation failed", { id: row.id, error })
    }
  }

  return { followups, escalations }
}
