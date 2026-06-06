/**
 * Canonical thrml_namer_v4 sheet layout (Campaign / Ad Set / Ad Builder).
 *
 * Internal IDs (stable, human-readable): C001, AS001, AD001 — matches paid-media `legacy_id`.
 * Platform IDs (Meta numeric): written after launch / registry sync — never embedded in Ad Name.
 */

export type NamerTabKind = "campaign" | "ad_set" | "ad"

export const THRML_LEGACY_ID_PATTERN = {
  campaign: /^C(\d+)$/i,
  ad_set: /^AS(\d+)$/i,
  ad: /^AD(\d+)$/i,
} as const

export const NAMER_TAB_CANDIDATES: Record<NamerTabKind, string[]> = {
  campaign: ["Campaign Builder", "② Campaign Builder", "2 Campaign Builder"],
  ad_set: ["Ad Set Builder", "② Ad Set Builder", "2 Ad Set Builder"],
  ad: ["Ad Builder", "② Ad Builder", "2 Ad Builder", "④ Creative Builder", "Creative Builder"],
}

/** Recommended Ad Builder column order (v4). Agents add missing columns at the end — no destructive reorder. */
export const AD_BUILDER_HEADERS_V4 = [
  "Ad ID",
  "Ad Set ID",
  "Campaign ID",
  "TEST",
  "VAR",
  "ANGLE",
  "FORMAT",
  "Size",
  "Video Length",
  "CTA",
  "Ad Name (auto)",
  "Platform Campaign ID",
  "Platform Ad Set ID",
  "Platform Ad ID",
  "GCS Path",
  "Hook Copy",
  "Status",
  "Pipeline Template",
  "Brief Input",
  "Creative Gen",
  "Campaign Gen",
  "Ad Set Gen",
  "Asset UUID",
] as const

export const CAMPAIGN_BUILDER_HEADERS_V4 = [
  "Campaign ID",
  "Platform Campaign ID",
  "Platform",
  "Phase",
  "Objective",
  "Funnel",
  "Audience Type",
  "Geo",
  "Campaign Name (auto)",
  "Opt. Event",
  "Status",
  "Priority",
  "Campaign Gen",
  "Notes",
] as const

export const AD_SET_BUILDER_HEADERS_V4 = [
  "Ad Set ID",
  "Campaign ID",
  "Platform Ad Set ID",
  "Platform Campaign ID",
  "Space Type",
  "Audience Src",
  "Placement",
  "Audience Details",
  "Ad Set Name (auto)",
  "Opt. Event",
  "Budget Weight",
  "Status",
  "Ad Set Gen",
  "Notes",
] as const

export const HEADER_PATTERNS = {
  thrmlCampaignId: [/^campaign id$/i, /^campaign name \(ref\)$/i],
  thrmlAdSetId: [/^ad set id$/i, /^adset id$/i],
  thrmlAdId: [/^ad id$/i],
  platformCampaignId: [/^platform campaign id$/i, /^platform camp id$/i],
  platformAdSetId: [/^platform ad set id$/i, /^platform adset id$/i],
  platformAdId: [/^platform ad id$/i],
  assetUuid: [/^asset uuid$/i],
  adName: [/→?\s*ad name/i, /^ad name/i],
  status: [/^status$/i],
  gcsPath: [/^gcs path$/i],
} as const

/** Columns auto-added to Ad Builder when missing (never removes Asset GCS Link if present). */
/** Meta Graph object IDs — separate from C001 / AS001 / AD001. */
export type MetaPlatformIds = {
  adId: string
  adSetId: string
  campaignId: string
}

export const AD_BUILDER_ENSURE_COLUMNS = [
  "Platform Campaign ID",
  "Platform Ad Set ID",
  "Size",
  "Video Length",
  "Pipeline Template",
  "Brief Input",
  "Creative Gen",
  "Campaign Gen",
  "Ad Set Gen",
  "Asset UUID",
] as const
