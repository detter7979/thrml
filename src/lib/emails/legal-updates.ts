import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

import { emailAlreadySent, logEmailSent } from "./email-log"

const APP_URL = THRML_APP_URL
const EMAIL_TYPE = "legal_update"

export type LegalUpdateKind = "privacy" | "terms" | "consumer_health"

const KIND_META: Record<LegalUpdateKind, { label: string; url: string }> = {
  privacy: { label: "Privacy Policy", url: `${APP_URL}/privacy` },
  terms: { label: "Terms of Service", url: `${APP_URL}/terms` },
  consumer_health: { label: "Consumer Health Data Privacy Policy", url: `${APP_URL}/legal` },
}

export type LegalUpdateBroadcastArgs = {
  kind: LegalUpdateKind
  /** Unique version tag, e.g. "2026-08-01"; dedupes re-runs per user. */
  version: string
  effectiveDate: string
  /** Short bullets describing what changed. */
  changes: string[]
  /** Cap per invocation so re-runs can page through large user bases. */
  batchSize?: number
  dryRun?: boolean
}

/**
 * Notifies every account holder of a policy change. Legally required notice —
 * intentionally NOT gated on notification preferences. Idempotent per
 * (user, version): safe to invoke repeatedly until `remaining` reaches 0.
 */
export async function sendLegalUpdateBroadcast(args: LegalUpdateBroadcastArgs): Promise<{
  sent: number
  skipped: number
  remaining: number
  dryRun: boolean
}> {
  const admin = createAdminClient()
  const meta = KIND_META[args.kind]
  const referenceId = `${args.kind}:${args.version}`
  const batchSize = Math.max(1, Math.min(args.batchSize ?? 200, 500))

  let sent = 0
  let skipped = 0
  let candidates = 0
  let page = 1

  while (sent < batchSize) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error("[emails/legal-updates] listUsers failed", error.message)
      break
    }
    const users = data?.users ?? []
    if (!users.length) break

    for (const user of users) {
      if (!user.email) continue
      if (await emailAlreadySent(user.id, EMAIL_TYPE, referenceId)) {
        skipped++
        continue
      }
      candidates++
      if (sent >= batchSize) continue

      if (args.dryRun) {
        sent++
        continue
      }

      const result = await sendThrmlLayoutEmail({
        to: user.email,
        userId: user.id,
        replyTo: null,
        subject: `We've updated our ${meta.label}`,
        layout: {
          preview: `Updates to the Thrml ${meta.label}, effective ${args.effectiveDate}`,
          kicker: "Policy update",
          title: `Our ${meta.label} is changing.`,
          paragraphs: [
            `We're updating the Thrml ${meta.label}, effective ${args.effectiveDate}. Here's a summary of what's changing:`,
          ],
          listItems: args.changes,
          cta: { label: `Read the updated ${meta.label}`, href: meta.url },
          footnote:
            "Continuing to use Thrml after the effective date means you accept the updated terms. If you have questions, reply to this email or contact hello@usethrml.com. This is a required service notice and is sent regardless of email preferences.",
        },
      })

      if (result.sent) {
        await logEmailSent(user.id, EMAIL_TYPE, referenceId)
        sent++
      }
    }

    if (users.length < 200) break
    page++
  }

  return { sent, skipped, remaining: Math.max(0, candidates - sent), dryRun: Boolean(args.dryRun) }
}
