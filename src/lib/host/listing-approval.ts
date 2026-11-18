import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Founding-host phase switches (platform_settings):
 *  - require_listing_approval: new listings stay pending until approved in /admin/listings
 *    (enforced by the enforce_listing_approval trigger; this is for UI and messaging).
 *  - host_applications_mode: /become-a-host sends new visitors to the application first.
 */
export type HostFunnelSettings = {
  requireListingApproval: boolean
  hostApplicationsMode: boolean
}

export const DEFAULT_HOST_FUNNEL_SETTINGS: HostFunnelSettings = {
  requireListingApproval: false,
  hostApplicationsMode: false,
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return null
}

export async function fetchHostFunnelSettings(admin: Pick<SupabaseClient, "from">): Promise<HostFunnelSettings> {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["require_listing_approval", "host_applications_mode"])
  const byKey = new Map((data ?? []).map((row) => [String(row.key), row.value as unknown]))
  return {
    requireListingApproval:
      asBool(byKey.get("require_listing_approval")) ?? DEFAULT_HOST_FUNNEL_SETTINGS.requireListingApproval,
    hostApplicationsMode:
      asBool(byKey.get("host_applications_mode")) ?? DEFAULT_HOST_FUNNEL_SETTINGS.hostApplicationsMode,
  }
}

export type ApprovalStatus = "pending" | "approved" | "declined"

export function normalizeApprovalStatus(value: unknown): ApprovalStatus {
  return value === "pending" || value === "declined" ? value : "approved"
}

/** Host-facing label for a listing card. */
export function hostListingStatusLabel(listing: { is_active: boolean; approval_status?: unknown }): string {
  const approval = normalizeApprovalStatus(listing.approval_status)
  if (approval === "pending") return "Pending review"
  if (approval === "declined") return "Not approved"
  return listing.is_active ? "Live" : "Draft"
}

export const PENDING_REVIEW_MESSAGE =
  "Thanks! We review every new listing before it goes live, usually within 1–2 days. We'll email you as soon as it's approved."
