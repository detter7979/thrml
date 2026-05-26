/**
 * Lists recent bookings you can use to test /incident/[bookingId].
 * Usage: npx tsx scripts/list-incident-test-bookings.ts [guest-email]
 */
import { loadEnvLocal } from "./lib/load-env-local"
import { createClient } from "@supabase/supabase-js"

loadEnvLocal()

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
const guestEmailFilter = process.argv[2]?.trim().toLowerCase()

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, guest_id, session_date, status, created_at")
    .order("created_at", { ascending: false })
    .limit(25)

  if (error) {
    console.error("bookings query failed:", error.message)
    process.exit(1)
  }

  if (!bookings?.length) {
    console.log("No bookings found.")
    return
  }

  const guestIds = [...new Set(bookings.map((b) => b.guest_id).filter(Boolean))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", guestIds)

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const authEmailByGuestId = new Map<string, string>()

  for (const guestId of guestIds) {
    const { data: authData } = await supabase.auth.admin.getUserById(guestId)
    const email = authData.user?.email?.trim()
    if (email) authEmailByGuestId.set(guestId, email)
  }

  console.log("\nIncident report test links\n")
  console.log(`App base URL: ${appUrl}`)
  console.log("Log in as the guest email below, then open the incident URL.\n")

  let shown = 0
  for (const booking of bookings) {
    const profile = booking.guest_id ? profileById.get(booking.guest_id) : null
    const email =
      (booking.guest_id ? authEmailByGuestId.get(booking.guest_id) : null) ??
      profile?.email ??
      ""
    if (guestEmailFilter && email.toLowerCase() !== guestEmailFilter) continue

    shown += 1
    const name = profile?.full_name ?? "Unknown guest"
    console.log(`${shown}. ${name} (${email || "no email"})`)
    console.log(`   Booking: ${booking.id}`)
    console.log(`   Status: ${booking.status ?? "—"} · Session: ${booking.session_date ?? "—"}`)
    console.log(`   Test URL: ${appUrl}/incident/${booking.id}`)
    console.log("")
  }

  if (shown === 0) {
    console.log(guestEmailFilter ? `No bookings found for guest email: ${guestEmailFilter}` : "No bookings to show.")
  } else {
    console.log("Tips:")
    console.log("- Only the booking guest can open the link (others redirect to dashboard).")
    console.log("- Narrative is the only required field (10+ characters).")
    console.log("- Evidence uploads go to incident-evidence/{your-user-id}/{incident-id}/...")
    console.log("- Local dev URL: http://localhost:3000/incident/{booking-id}")
    console.log("- Filter by email: npx tsx scripts/list-incident-test-bookings.ts you@example.com")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
