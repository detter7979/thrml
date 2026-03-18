import { requireAdmin } from "@/lib/admin-guard"

import { AdminListingsClient } from "./listings-client"

export const dynamic = "force-dynamic"

export default async function AdminListingsPage() {
  const { admin } = await requireAdmin()

  const { data: listingRows } = await admin
    .from("listings")
    .select("id, host_id, title, service_type, city, state, location_city, location_state, is_active, is_deleted, created_at")
    .order("created_at", { ascending: false })

  const listings = (listingRows ?? []) as Array<Record<string, unknown>>
  const listingIds = listings
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((value): value is string => Boolean(value))
  const hostIds = Array.from(
    new Set(listings.map((row) => (typeof row.host_id === "string" ? row.host_id : null)).filter(Boolean))
  ) as string[]

  const [{ data: bookingCounts }, { data: hosts }] = await Promise.all([
    listingIds.length
      ? admin.from("bookings").select("id, listing_id").in("listing_id", listingIds)
      : Promise.resolve({ data: [] }),
    hostIds.length ? admin.from("profiles").select("id, full_name").in("id", hostIds) : Promise.resolve({ data: [] }),
  ])

  const hostMap = new Map((hosts ?? []).map((row) => [String(row.id), row.full_name ?? null]))
  const countMap = new Map<string, number>()
  for (const row of bookingCounts ?? []) {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    if (!listingId) continue
    countMap.set(listingId, (countMap.get(listingId) ?? 0) + 1)
  }

  const rows = listings.map((row) => {
    const city =
      typeof row.city === "string"
        ? row.city
        : typeof row.location_city === "string"
          ? row.location_city
          : "—"
    const state =
      typeof row.state === "string"
        ? row.state
        : typeof row.location_state === "string"
          ? row.location_state
          : ""
    const cityState = [city, state].filter(Boolean).join(", ")
    const id = String(row.id ?? "")
    const hostId = typeof row.host_id === "string" ? row.host_id : null
    return {
      id,
      title: typeof row.title === "string" ? row.title : null,
      service_type: typeof row.service_type === "string" ? row.service_type : null,
      host_name: hostId ? (hostMap.get(hostId) ?? null) : null,
      city_state: cityState || "—",
      is_active: Boolean(row.is_active),
      is_deleted: Boolean(row.is_deleted),
      bookings_count: countMap.get(id) ?? 0,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    }
  })

  return <AdminListingsClient rows={rows} />
}
