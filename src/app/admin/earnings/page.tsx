import { requireAdmin } from "@/lib/admin-guard"

import { AdminEarningsClient, type EarningsRow } from "./earnings-client"

export const dynamic = "force-dynamic"

export default async function AdminEarningsPage() {
  const { admin } = await requireAdmin()

  const { data: bookingRows } = await admin
    .from("bookings")
    .select(
      "id, listing_id, guest_id, session_date, start_time, end_time, duration_hours, guest_count, price_per_person, subtotal, service_fee, host_payout, total_charged, status"
    )
    .order("session_date", { ascending: false })

  const bookings = (bookingRows ?? []) as Array<Record<string, unknown>>
  const listingIds = Array.from(
    new Set(bookings.map((row) => (typeof row.listing_id === "string" ? row.listing_id : null)).filter(Boolean))
  ) as string[]
  const guestIds = Array.from(
    new Set(bookings.map((row) => (typeof row.guest_id === "string" ? row.guest_id : null)).filter(Boolean))
  ) as string[]

  const [{ data: listingRows }, { data: guestRows }] = await Promise.all([
    listingIds.length ? admin.from("listings").select("id, title").in("id", listingIds) : Promise.resolve({ data: [] }),
    guestIds.length
      ? admin.from("profiles").select("id, full_name").in("id", guestIds)
      : Promise.resolve({ data: [] }),
  ])

  const listingMap = new Map((listingRows ?? []).map((row) => [String(row.id), row.title ?? null]))
  const guestMap = new Map((guestRows ?? []).map((row) => [String(row.id), row.full_name ?? null]))

  const initialRows: EarningsRow[] = bookings.map((row) => {
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    const guestId = typeof row.guest_id === "string" ? row.guest_id : null
    return {
      id: String(row.id ?? ""),
      session_date: typeof row.session_date === "string" ? row.session_date : null,
      listing_id: listingId,
      listing_title: listingId ? (listingMap.get(listingId) ?? null) : null,
      guest_name: guestId ? (guestMap.get(guestId) ?? null) : null,
      guest_count: Number(row.guest_count ?? 0),
      start_time: typeof row.start_time === "string" ? row.start_time : null,
      end_time: typeof row.end_time === "string" ? row.end_time : null,
      duration_hours: Number(row.duration_hours ?? 0),
      price_per_person: Number(row.price_per_person ?? 0),
      subtotal: Number(row.subtotal ?? 0),
      service_fee: Number(row.service_fee ?? 0),
      host_payout: Number(row.host_payout ?? 0),
      total_charged: Number(row.total_charged ?? 0),
      status: typeof row.status === "string" ? row.status : "pending",
    }
  })

  return <AdminEarningsClient initialRows={initialRows} />
}
