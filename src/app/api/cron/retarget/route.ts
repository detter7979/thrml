import { NextRequest, NextResponse } from "next/server"

import {
  isWeeklyDigestDue,
  loadActiveNewsletterEmails,
  weeklyDigestCooldownMs,
} from "@/lib/emails/newsletter-digest"
import { processHostIdentityFollowUps } from "@/lib/emails/host-identity"
import { processGuestRetargeting, processHostRetargeting } from "@/lib/emails/retargeting"
import { sendEmail } from "@/lib/emails/send"
import {
  buildWeeklyDigestEmail,
  countNewListingsThisWeek,
  fetchListingsForWeeklyDigest,
} from "@/lib/emails/weekly-digest"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

function authGuard(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  return Boolean(secret && supplied === secret)
}

async function sendNewsletterDigest(): Promise<{ sent: number; skipped: number; skipped_recent: number }> {
  const admin = createAdminClient()
  const cooldownCutoff = new Date(Date.now() - weeklyDigestCooldownMs()).toISOString()
  const { data: subscribers, error: subError } = await admin
    .from("newsletter_subscribers")
    .select("email, market_city, market_state, last_weekly_digest_sent_at")
    .eq("is_active", true)
    .or(`last_weekly_digest_sent_at.is.null,last_weekly_digest_sent_at.lt.${cooldownCutoff}`)

  if (subError) {
    console.error("[retarget] newsletter subscribers load failed", subError.message)
  }
  if (!subscribers?.length) return { sent: 0, skipped: 0, skipped_recent: 0 }

  const exploreUrl = `${APP_URL}/explore`
  const unsubBase = `${APP_URL}/unsubscribe`
  const newThisWeekCount = await countNewListingsThisWeek(admin)

  const defaultDigest = await fetchListingsForWeeklyDigest(admin, {
    marketCity: null,
    marketState: null,
    newThisWeekCount,
  })
  const digestByMarket = new Map<string, typeof defaultDigest>()

  let sent = 0
  let skipped = 0
  let skippedRecent = 0

  for (const row of subscribers) {
    const email = row.email as string
    if (!isWeeklyDigestDue(row.last_weekly_digest_sent_at as string | null | undefined)) {
      skippedRecent++
      continue
    }
    const marketCity =
      typeof row.market_city === "string" && row.market_city.trim().length >= 2
        ? row.market_city.trim()
        : null
    const marketState =
      typeof row.market_state === "string" && row.market_state.trim().length >= 2
        ? row.market_state.trim()
        : null

    let digest = defaultDigest
    if (marketCity) {
      const key = marketCity.toLowerCase()
      if (!digestByMarket.has(key)) {
        digestByMarket.set(
          key,
          await fetchListingsForWeeklyDigest(admin, {
            marketCity,
            marketState,
            newThisWeekCount,
          })
        )
      }
      digest = digestByMarket.get(key) ?? defaultDigest
    }

    const unsubUrl = `${unsubBase}?email=${encodeURIComponent(email)}`
    const { subject, html, text } = await buildWeeklyDigestEmail({
      supabase: admin,
      unsubUrl,
      exploreUrl,
      listings: digest.rows,
      newThisWeekCount,
      usedMarketFilter: digest.usedMarketFilter,
      marketCity,
    })

    const result = await sendEmail({ to: email, subject, html, text })
    if (result.sent) {
      sent++
      const { error: markError } = await admin
        .from("newsletter_subscribers")
        .update({ last_weekly_digest_sent_at: new Date().toISOString() })
        .eq("email", email)
        .eq("is_active", true)
      if (markError) {
        console.error("[retarget] failed to mark weekly digest sent", { email, error: markError.message })
      }
    } else {
      skipped++
    }
  }

  return { sent, skipped, skipped_recent: skippedRecent }
}

export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const newsletterEmails = await loadActiveNewsletterEmails(admin)

  const [hostResult, guestResult, newsletterResult, identityFollowUpResult] = await Promise.allSettled([
    processHostRetargeting({ skipEmails: newsletterEmails }),
    processGuestRetargeting({ skipEmails: newsletterEmails }),
    sendNewsletterDigest(),
    processHostIdentityFollowUps(),
  ])

  return NextResponse.json({
    ok: true,
    host_retarget: hostResult.status === "fulfilled" ? hostResult.value : { error: String(hostResult.reason) },
    guest_retarget: guestResult.status === "fulfilled" ? guestResult.value : { error: String(guestResult.reason) },
    newsletter: newsletterResult.status === "fulfilled" ? newsletterResult.value : { error: String(newsletterResult.reason) },
    host_identity_followup:
      identityFollowUpResult.status === "fulfilled"
        ? identityFollowUpResult.value
        : { error: String(identityFollowUpResult.reason) },
  })
}
