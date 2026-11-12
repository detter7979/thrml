import type { SupabaseClient } from "@supabase/supabase-js"

import { isSaunasOnlyLaunch } from "@/lib/launch-config"

import { evaluateLaunchReadiness, type ReadinessHost, type ReadinessListing, type ReadinessReport } from "./readiness"

type AdminLike = Pick<SupabaseClient, "from">

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

/** Load listings, photos, blackouts and hosts, then evaluate readiness. Admin client only. */
export async function loadLaunchReadiness(admin: AdminLike, now = new Date()): Promise<ReadinessReport> {
  const { data: listingRows, error } = await admin
    .from("listings")
    .select("id, title, host_id, service_type, is_active, lat, lng, availability")
  if (error) throw new Error(error.message)

  const listingIds = (listingRows ?? []).map((row) => String(row.id))
  const hostIds = [...new Set((listingRows ?? []).map((row) => String(row.host_id)))]
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now)
  horizon.setUTCDate(horizon.getUTCDate() + 21)

  const [{ data: photoRows }, { data: blackoutRows }, { data: hostRows }] = await Promise.all([
    listingIds.length
      ? admin.from("listing_photos").select("listing_id").in("listing_id", listingIds)
      : Promise.resolve({ data: [] as { listing_id: string }[] }),
    listingIds.length
      ? admin
          .from("listing_blackout_dates")
          .select("listing_id, blackout_date")
          .in("listing_id", listingIds)
          .gte("blackout_date", today)
          .lte("blackout_date", horizon.toISOString().slice(0, 10))
      : Promise.resolve({ data: [] as { listing_id: string; blackout_date: string }[] }),
    hostIds.length
      ? admin.from("profiles").select("id, full_name, id_verified, stripe_payouts_enabled").in("id", hostIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])

  const photoCounts = new Map<string, number>()
  for (const row of photoRows ?? []) {
    const id = String(row.listing_id)
    photoCounts.set(id, (photoCounts.get(id) ?? 0) + 1)
  }
  const blackouts = new Map<string, string[]>()
  for (const row of blackoutRows ?? []) {
    const id = String(row.listing_id)
    blackouts.set(id, [...(blackouts.get(id) ?? []), String(row.blackout_date)])
  }

  const listings: ReadinessListing[] = (listingRows ?? []).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : null,
    hostId: String(row.host_id),
    serviceType: typeof row.service_type === "string" ? row.service_type : null,
    isActive: row.is_active === true,
    lat: toNumber(row.lat),
    lng: toNumber(row.lng),
    photoCount: photoCounts.get(String(row.id)) ?? 0,
    availability: row.availability,
    blackoutDates: blackouts.get(String(row.id)) ?? [],
  }))

  const hosts: ReadinessHost[] = ((hostRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: typeof row.full_name === "string" ? row.full_name : null,
    idVerified: row.id_verified === true,
    payoutsEnabled: row.stripe_payouts_enabled === true,
  }))

  return evaluateLaunchReadiness({ listings, hosts, now, saunasOnly: isSaunasOnlyLaunch() })
}
