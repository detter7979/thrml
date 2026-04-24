import { NextRequest, NextResponse } from "next/server"

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

async function sendNewsletterDigest(): Promise<{ sent: number; skipped: number }> {
  const admin = createAdminClient()
  const { data: subscribers, error: subError } = await admin
    .from("newsletter_subscribers")
    .select("email, market_city, market_state")
    .eq("is_active", true)

  if (subError) {
    console.error("[retarget] newsletter subscribers load failed", subError.message)
  }
  if (!subscribers?.length) return { sent: 0, skipped: 0 }

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

  for (const row of subscribers) {
    const email = row.email as string
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
    const { subject, html, text } = buildWeeklyDigestEmail({
      supabase: admin,
      unsubUrl,
      exploreUrl,
      listings: digest.rows,
      newThisWeekCount,
      usedMarketFilter: digest.usedMarketFilter,
      marketCity,
    })

    const result = await sendEmail({ to: email, subject, html, text })
    result.sent ? sent++ : skipped++
  }

  return { sent, skipped }
}

export async function GET(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [hostResult, guestResult, newsletterResult] = await Promise.allSettled([
    processHostRetargeting(),
    processGuestRetargeting(),
    sendNewsletterDigest(),
  ])

  return NextResponse.json({
    ok: true,
    host_retarget: hostResult.status === "fulfilled" ? hostResult.value : { error: String(hostResult.reason) },
    guest_retarget: guestResult.status === "fulfilled" ? guestResult.value : { error: String(guestResult.reason) },
    newsletter: newsletterResult.status === "fulfilled" ? newsletterResult.value : { error: String(newsletterResult.reason) },
  })
}
