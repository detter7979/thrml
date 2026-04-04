import { NextRequest, NextResponse } from "next/server"

import { processGuestRetargeting, processHostRetargeting } from "@/lib/emails/retargeting"
import { sendEmail } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function authGuard(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  return Boolean(secret && supplied === secret)
}

async function getNewListingsThisWeek(): Promise<number> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .gte("created_at", since)
  return count ?? 0
}

async function sendNewsletterDigest(): Promise<{ sent: number; skipped: number }> {
  const admin = createAdminClient()
  const { data: subscribers } = await admin
    .from("newsletter_subscribers")
    .select("email")
    .eq("is_active", true)

  if (!subscribers?.length) return { sent: 0, skipped: 0 }

  const newListings = await getNewListingsThisWeek()
  const exploreUrl = `${APP_URL}/explore`
  const subject =
    newListings > 0
      ? `${newListings} new wellness space${newListings === 1 ? "" : "s"} near you this week`
      : "Private wellness spaces available near you"

  const bodyLines = newListings > 0
    ? `<p style="font-size:15px;line-height:1.8;color:#3E3329;">
        ${newListings} new private wellness space${newListings === 1 ? " was" : "s were"} listed on Thrml this week —
        saunas, cold plunges, float tanks, and more.
       </p>`
    : `<p style="font-size:15px;line-height:1.8;color:#3E3329;">
        Private wellness spaces are available near you. Book a sauna, cold plunge,
        or float tank by the hour — no membership required.
       </p>`

  const unsubBase = `${APP_URL}/unsubscribe`

  let sent = 0
  let skipped = 0

  for (const { email } of subscribers) {
    const unsubUrl = `${unsubBase}?email=${encodeURIComponent(email)}`
    const html = `
      <div style="background:#FAF7F4;padding:32px 16px;font-family:system-ui,Arial,sans-serif;color:#2C2420;">
        <div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #E9DED4;border-radius:14px;overflow:hidden;">
          <div style="background:#1A1410;padding:20px 24px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.1em;">THRML</span>
          </div>
          <div style="padding:28px 24px;">
            <h1 style="margin:0 0 12px;font-size:22px;">Weekly spaces update</h1>
            ${bodyLines}
            <p style="margin:22px 0 0;">
              <a href="${exploreUrl}" style="display:inline-block;background:#C4623A;color:#fff;
                text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;">
                Browse spaces →
              </a>
            </p>
          </div>
          <div style="padding:14px 24px;border-top:1px solid #E9DED4;">
            <p style="margin:0;font-size:12px;color:#796A5E;">
              Thrml · <a href="${unsubUrl}" style="color:#796A5E;">Unsubscribe</a>
            </p>
          </div>
        </div>
      </div>`

    const text = [subject, "", `Browse spaces: ${exploreUrl}`, "", `Unsubscribe: ${unsubUrl}`].join("\n")
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
