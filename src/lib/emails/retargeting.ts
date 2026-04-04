import { sendEmail } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function wrap(content: string) {
  return `
  <div style="background:#FAF7F4;padding:32px 16px;font-family:system-ui,Arial,sans-serif;color:#2C2420;">
    <div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #E9DED4;border-radius:14px;overflow:hidden;">
      <div style="background:#1A1410;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.1em;">THRML</span>
      </div>
      <div style="padding:28px 24px;">${content}</div>
      <div style="padding:14px 24px;border-top:1px solid #E9DED4;">
        <p style="margin:0;font-size:12px;color:#796A5E;">
          Thrml ·
          <a href="${APP_URL}/dashboard/account#notifications" style="color:#796A5E;">Unsubscribe</a>
        </p>
      </div>
    </div>
  </div>`
}

function cta(label: string, url: string) {
  return `<p style="margin:22px 0 0;"><a href="${url}"
    style="display:inline-block;background:#C4623A;color:#fff;text-decoration:none;
           font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;">${label}</a></p>`
}

async function alreadySentEmail(userId: string, emailType: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_log")
    .select("id")
    .eq("user_id", userId)
    .eq("email_type", emailType)
    .maybeSingle()
  return Boolean(data)
}

async function logEmail(userId: string, emailType: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from("email_log").upsert(
    { user_id: userId, email_type: emailType, reference_id: userId },
    { onConflict: "user_id,email_type,reference_id" }
  )
}

// ─── Host retargeting (no listing created after 3 or 7 days) ─────────────

export async function processHostRetargeting(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const day3Start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const day3End = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const day7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day7End = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

  // Find hosts (users where is_host = true) who signed up 3 or 7 days ago
  // and haven't created any listings yet.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("is_host", true)
    .or(
      `and(created_at.gte.${day3Start.toISOString()},created_at.lte.${day3End.toISOString()}),` +
      `and(created_at.gte.${day7Start.toISOString()},created_at.lte.${day7End.toISOString()})`
    )

  if (!profiles?.length) return { sent: 0 }

  const listingCheckIds = profiles.map((p) => p.id)
  const { data: existingListings } = await admin
    .from("listings")
    .select("host_id")
    .in("host_id", listingCheckIds)

  const hostIdsWithListings = new Set((existingListings ?? []).map((l) => l.host_id as string))
  let sent = 0

  for (const profile of profiles) {
    if (hostIdsWithListings.has(profile.id)) continue
    const createdAt = new Date(profile.created_at as string)
    const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
    const tag = daysSince <= 4 ? "host_retarget_day3" : "host_retarget_day7"

    if (await alreadySentEmail(profile.id, tag)) continue

    const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
    const email = authUser.user?.email
    if (!email) continue

    const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? "there"
    const listingUrl = `${APP_URL}/dashboard/listings/new`
    const subject =
      daysSince <= 4
        ? "Your first listing is 3 steps away"
        : "Hosts on Thrml earn up to $400/month — you're one listing away"

    const bodyHtml =
      daysSince <= 4
        ? `<p style="font-size:15px;line-height:1.7;">Hey ${firstName}, you signed up as a Thrml host a few days ago but haven't created a listing yet.<br/><br/>It takes under 5 minutes — add your space, set a price, and go live today.</p>${cta("Create your listing →", listingUrl)}`
        : `<p style="font-size:15px;line-height:1.7;">Hey ${firstName}, wellness spaces on Thrml book consistently every weekend.<br/><br/>Hosts who listed their sauna or cold plunge in the last 30 days are already earning. Your space could be next.</p>${cta("List your space today →", listingUrl)}`

    const result = await sendEmail({
      to: email,
      subject,
      html: wrap(bodyHtml),
      text: subject + "\n\n" + `Create your listing: ${listingUrl}`,
      userId: profile.id,
      preferenceKey: "marketing_product_updates",
    })

    if (result.sent) {
      await logEmail(profile.id, tag)
      sent++
    }
  }

  return { sent }
}

// ─── Guest retargeting (no booking made after 3 or 7 days) ───────────────

export async function processGuestRetargeting(): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const day3Start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const day3End = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const day7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day7End = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, created_at")
    .or(
      `and(created_at.gte.${day3Start.toISOString()},created_at.lte.${day3End.toISOString()}),` +
      `and(created_at.gte.${day7Start.toISOString()},created_at.lte.${day7End.toISOString()})`
    )

  if (!profiles?.length) return { sent: 0 }

  const guestIds = profiles.map((p) => p.id)
  const { data: existingBookings } = await admin
    .from("bookings")
    .select("guest_id")
    .in("guest_id", guestIds)
    .in("status", ["confirmed", "completed", "pending_host"])

  const guestIdsWithBookings = new Set((existingBookings ?? []).map((b) => b.guest_id as string))
  let sent = 0

  for (const profile of profiles) {
    if (guestIdsWithBookings.has(profile.id)) continue
    const createdAt = new Date(profile.created_at as string)
    const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
    const tag = daysSince <= 4 ? "guest_retarget_day3" : "guest_retarget_day7"

    if (await alreadySentEmail(profile.id, tag)) continue

    const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
    const email = authUser.user?.email
    if (!email) continue

    const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? "there"
    const exploreUrl = `${APP_URL}/explore`
    const subject =
      daysSince <= 4
        ? "New wellness spaces near you"
        : "Still looking? Here's what's available this week"

    const bodyHtml =
      daysSince <= 4
        ? `<p style="font-size:15px;line-height:1.7;">Hey ${firstName}, new private sauna and cold plunge spaces just listed near you.<br/><br/>Most spaces start around $15/hour — no membership required.</p>${cta("Find spaces near you →", exploreUrl)}`
        : `<p style="font-size:15px;line-height:1.7;">Hey ${firstName}, there are wellness spaces available to book this week — saunas, cold plunges, float tanks, and more.<br/><br/>Browse what's near you and book for as little as $15/hour.</p>${cta("Browse new listings →", exploreUrl)}`

    const result = await sendEmail({
      to: email,
      subject,
      html: wrap(bodyHtml),
      text: subject + "\n\n" + `Find spaces: ${exploreUrl}`,
      userId: profile.id,
      preferenceKey: "marketing_offers",
    })

    if (result.sent) {
      await logEmail(profile.id, tag)
      sent++
    }
  }

  return { sent }
}
