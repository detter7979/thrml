import { requireAdmin } from "@/lib/admin-guard"

import { AdminUsersClient } from "./users-client"

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const { admin } = await requireAdmin()

  const [{ data: profiles }, authUsersResponse, { data: bookings }, { data: listings }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers(),
    admin.from("bookings").select("id, guest_id"),
    admin.from("listings").select("id, host_id"),
  ])

  const authEmailById = new Map<string, string | null>()
  for (const user of authUsersResponse.data.users ?? []) {
    authEmailById.set(user.id, user.email ?? null)
  }

  const bookingCountByGuest = new Map<string, number>()
  for (const row of bookings ?? []) {
    const guestId = typeof row.guest_id === "string" ? row.guest_id : null
    if (!guestId) continue
    bookingCountByGuest.set(guestId, (bookingCountByGuest.get(guestId) ?? 0) + 1)
  }

  const listingCountByHost = new Map<string, number>()
  for (const row of listings ?? []) {
    const hostId = typeof row.host_id === "string" ? row.host_id : null
    if (!hostId) continue
    listingCountByHost.set(hostId, (listingCountByHost.get(hostId) ?? 0) + 1)
  }

  const rows = (profiles ?? []).map((profile) => {
    const id = String(profile.id ?? "")
    const intentRaw = typeof profile.ui_intent === "string" ? profile.ui_intent : "guest"
    const intent = ["guest", "host", "both"].includes(intentRaw) ? intentRaw : "guest"
    const listingCount = listingCountByHost.get(id) ?? 0
    return {
      id,
      full_name: typeof profile.full_name === "string" ? profile.full_name : null,
      email: authEmailById.get(id) ?? (typeof profile.email === "string" ? profile.email : null),
      created_at: typeof profile.created_at === "string" ? profile.created_at : null,
      intent,
      total_bookings: bookingCountByGuest.get(id) ?? 0,
      total_listings: listingCount,
      is_host: intent === "host" || intent === "both" || listingCount > 0,
      is_admin: Boolean(profile.is_admin),
    }
  })

  return <AdminUsersClient initialRows={rows} />
}
