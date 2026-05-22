import { requireAdmin } from "@/lib/admin-guard"
import { loadAdminEarningsBookings } from "@/lib/finance/load-earnings-bookings"

import { AdminEarningsClient, type EarningsRow } from "./earnings-client"

export const dynamic = "force-dynamic"

export default async function AdminEarningsPage() {
  const { admin } = await requireAdmin()

  const { rows: bookings, loadError } = await loadAdminEarningsBookings(admin)
  const listingIds = Array.from(
    new Set(bookings.map((row) => (typeof row.listing_id === "string" ? row.listing_id : null)).filter(Boolean))
  ) as string[]
  const guestIds = Array.from(
    new Set(bookings.map((row) => (typeof row.guest_id === "string" ? row.guest_id : null)).filter(Boolean))
  ) as string[]
  const hostIds = Array.from(
    new Set(bookings.map((row) => (typeof row.host_id === "string" ? row.host_id : null)).filter(Boolean))
  ) as string[]

  const [{ data: listingRows }, { data: guestRows }, { data: hostRows }] = await Promise.all([
    listingIds.length
      ? admin
          .from("listings")
          .select("id, title, service_type, city, state, location_city, location_state")
          .in("id", listingIds)
      : Promise.resolve({ data: [] }),
    guestIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", guestIds)
      : Promise.resolve({ data: [] }),
    hostIds.length
      ? admin.from("profiles").select("id, full_name").in("id", hostIds)
      : Promise.resolve({ data: [] }),
  ])

  type ListingMeta = {
    title: string | null
    service_type: string | null
    city: string | null
    state: string | null
  }

  const listingMap = new Map<string, ListingMeta>(
    (listingRows ?? []).map((row) => {
      const city =
        typeof row.city === "string"
          ? row.city
          : typeof row.location_city === "string"
            ? row.location_city
            : null
      const state =
        typeof row.state === "string"
          ? row.state
          : typeof row.location_state === "string"
            ? row.location_state
            : null
      return [
        String(row.id),
        {
          title: typeof row.title === "string" ? row.title : null,
          service_type: typeof row.service_type === "string" ? row.service_type : null,
          city,
          state,
        },
      ]
    })
  )
  type GuestMeta = { full_name: string | null; email: string | null }

  const guestMap = new Map<string, GuestMeta>(
    (guestRows ?? []).map((row) => [
      String(row.id),
      {
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        email: typeof row.email === "string" ? row.email : null,
      },
    ])
  )
  const hostMap = new Map((hostRows ?? []).map((row) => [String(row.id), row.full_name ?? null]))

  const initialRows: EarningsRow[] = bookings.map((row) => {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    const guestId = typeof row.guest_id === "string" ? row.guest_id : null
    const hostId = typeof row.host_id === "string" ? row.host_id : null
    const listing = listingId ? listingMap.get(listingId) : null
    const createdAt = typeof row.created_at === "string" ? row.created_at : null
    return {
      id: String(row.id ?? ""),
      session_date: typeof row.session_date === "string" ? row.session_date : null,
      booked_at: createdAt ? createdAt.slice(0, 10) : null,
      listing_id: listingId,
      listing_title: listing?.title ?? null,
      service_type: listing?.service_type ?? null,
      city: listing?.city ?? null,
      state: listing?.state ?? null,
      host_name: hostId ? (hostMap.get(hostId) ?? null) : null,
      guest_name: guestId ? (guestMap.get(guestId)?.full_name ?? null) : null,
      guest_email: guestId ? (guestMap.get(guestId)?.email ?? null) : null,
      guest_count: Number(row.guest_count ?? 0),
      start_time: typeof row.start_time === "string" ? row.start_time : null,
      end_time: typeof row.end_time === "string" ? row.end_time : null,
      duration_hours: Number(row.duration_hours ?? 0),
      price_per_person: Number(row.price_per_person ?? 0),
      subtotal: Number(row.subtotal ?? 0),
      service_fee: Number(row.service_fee ?? 0),
      guest_fee: Number(row.guest_fee ?? 0),
      host_fee: Number(row.host_fee ?? 0),
      host_payout: Number(row.host_payout ?? 0),
      total_charged: Number(row.total_charged ?? 0),
      refunded_amount: Number(row.refunded_amount ?? 0),
      referral_credit_applied_cents: Number(row.referral_credit_applied_cents ?? 0),
      user_credit_applied_cents: Number(row.user_credit_applied_cents ?? 0),
      status: typeof row.status === "string" ? row.status : "pending",
    }
  })

  return <AdminEarningsClient initialRows={initialRows} loadError={loadError} />
}
