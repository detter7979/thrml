import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_URL = THRML_APP_URL

type RetargetOptions = {
  skipEmails?: Set<string>
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

export async function processHostRetargeting(options?: RetargetOptions): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const day3Start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const day3End = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const day7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day7End = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

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
  const { data: existingListings } = await admin.from("listings").select("host_id").in("host_id", listingCheckIds)

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
    if (options?.skipEmails?.has(email.trim().toLowerCase())) continue

    const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? "there"
    const listingUrl = `${APP_URL}/dashboard/listings/new`
    const subject =
      daysSince <= 4
        ? "Your first listing is 3 steps away"
        : "Hosts on Thrml earn up to $400/month — you're one listing away"

    const result = await sendThrmlLayoutEmail({
      to: email,
      subject,
      userId: profile.id,
      preferenceKey: "marketing_product_updates",
      layout: {
        preview: subject,
        kicker: "Host update",
        title: `Hey ${firstName},`,
        paragraphs:
          daysSince <= 4
            ? [
                "You signed up as a Thrml host a few days ago but haven't created a listing yet.",
                "It takes under 5 minutes — add your space, set a price, and go live today.",
              ]
            : [
                "Wellness spaces on Thrml book consistently every weekend.",
                "Hosts who listed their sauna or cold plunge in the last 30 days are already earning. Your space could be next.",
              ],
        cta: {
          label: daysSince <= 4 ? "Create your listing" : "List your space today",
          href: listingUrl,
        },
        footnote: `Unsubscribe: ${APP_URL}/dashboard/account#notifications`,
      },
    })

    if (result.sent) {
      await logEmail(profile.id, tag)
      sent++
    }
  }

  return { sent }
}

export async function processGuestRetargeting(options?: RetargetOptions): Promise<{ sent: number }> {
  const admin = createAdminClient()
  const now = new Date()
  const day3Start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const day3End = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const day7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day7End = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, created_at")
    .or("is_host.eq.false,is_host.is.null")
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
    if (options?.skipEmails?.has(email.trim().toLowerCase())) continue

    const firstName = (profile.full_name as string | null)?.split(" ")[0] ?? "there"
    const exploreUrl = `${APP_URL}/explore`
    const subject =
      daysSince <= 4
        ? "New wellness spaces near you"
        : "Still looking? Here's what's available this week"

    const result = await sendThrmlLayoutEmail({
      to: email,
      subject,
      userId: profile.id,
      preferenceKey: "marketing_offers",
      layout: {
        preview: subject,
        kicker: "For you",
        title: `Hey ${firstName},`,
        paragraphs:
          daysSince <= 4
            ? [
                "New private sauna and cold plunge spaces just listed near you.",
                "Most spaces start around $15/hour — no membership required.",
              ]
            : [
                "There are wellness spaces available to book this week — saunas, cold plunges, float tanks, and more.",
                "Browse what's near you and book for as little as $15/hour.",
              ],
        cta: {
          label: daysSince <= 4 ? "Find spaces near you" : "Browse new listings",
          href: exploreUrl,
        },
        footnote: `Unsubscribe: ${APP_URL}/dashboard/account#notifications`,
      },
    })

    if (result.sent) {
      await logEmail(profile.id, tag)
      sent++
    }
  }

  return { sent }
}
