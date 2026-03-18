import { requireAdmin } from "@/lib/admin-guard"

import { AdminBookingsClient } from "./bookings-client"

export const dynamic = "force-dynamic"

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>
}) {
  const query = await searchParams
  const preselectedUserId = typeof query.userId === "string" ? query.userId : null
  const { admin } = await requireAdmin()

  const { data: bookingRows } = await admin
    .from("bookings")
    .select(
      "id, guest_id, host_id, listing_id, session_date, start_time, end_time, status, total_charged, host_payout, service_fee, refunded_amount, created_at"
    )
    .order("created_at", { ascending: false })

  const bookings = (bookingRows ?? []) as Array<Record<string, unknown>>
  const guestIds = Array.from(
    new Set(bookings.map((row) => (typeof row.guest_id === "string" ? row.guest_id : null)).filter(Boolean))
  ) as string[]
  const hostIds = Array.from(
    new Set(bookings.map((row) => (typeof row.host_id === "string" ? row.host_id : null)).filter(Boolean))
  ) as string[]
  const listingIds = Array.from(
    new Set(bookings.map((row) => (typeof row.listing_id === "string" ? row.listing_id : null)).filter(Boolean))
  ) as string[]

  const [{ data: guestProfiles }, { data: hostProfiles }, { data: listingRows }] = await Promise.all([
    guestIds.length ? admin.from("profiles").select("id, full_name").in("id", guestIds) : Promise.resolve({ data: [] }),
    hostIds.length ? admin.from("profiles").select("id, full_name").in("id", hostIds) : Promise.resolve({ data: [] }),
    listingIds.length ? admin.from("listings").select("id, title").in("id", listingIds) : Promise.resolve({ data: [] }),
  ])

  const guestMap = new Map((guestProfiles ?? []).map((row) => [String(row.id), row.full_name ?? null]))
  const hostMap = new Map((hostProfiles ?? []).map((row) => [String(row.id), row.full_name ?? null]))
  const listingMap = new Map((listingRows ?? []).map((row) => [String(row.id), row.title ?? null]))

  const rows = bookings.map((row) => {
    const guestId = typeof row.guest_id === "string" ? row.guest_id : null
    const hostId = typeof row.host_id === "string" ? row.host_id : null
    const listingId = typeof row.listing_id === "string" ? row.listing_id : null
    return {
      id: String(row.id ?? ""),
      guest_id: guestId,
      host_id: hostId,
      listing_id: listingId,
      listing_title: listingId ? (listingMap.get(listingId) ?? null) : null,
      guest_name: guestId ? (guestMap.get(guestId) ?? null) : null,
      host_name: hostId ? (hostMap.get(hostId) ?? null) : null,
      session_date: typeof row.session_date === "string" ? row.session_date : null,
      start_time: typeof row.start_time === "string" ? row.start_time : null,
      end_time: typeof row.end_time === "string" ? row.end_time : null,
      status: typeof row.status === "string" ? row.status : "pending",
      total_charged: Number(row.total_charged ?? 0),
      host_payout: Number(row.host_payout ?? 0),
      service_fee: Number(row.service_fee ?? 0),
      refunded_amount: Number(row.refunded_amount ?? 0),
    }
  })

  return <AdminBookingsClient initialRows={rows} preselectedUserId={preselectedUserId} />
}
