import type { google } from "googleapis"

import { parseNamingConvention } from "@/lib/agent/naming-parser"

/**
 * Finance Tracker "Platform Data" tab: one row per ad per day from the ad platforms (Meta API
 * today; invoices later). Shared by the daily reporting cron and the tracker maintenance tools.
 */

type Sheets = ReturnType<typeof google.sheets>

function fmt(n: number, dec = 2) { return n.toFixed(dec) }

// ── Cleaned report columns ─────────────────────────────────────────────────
export const CLEANED_HEADERS = [
  "Date", "Year", "Month", "Week",
  "Platform",
  "Campaign ID", "Ad Set ID", "Ad ID",
  // Names
  "Campaign Name", "Ad Set Name", "Ad Name",
  // Campaign-level parsed
  "Phase", "Campaign Objective", "Funnel Stage",
  // Audience
  "Audience Group",   // Host | Guest
  "Targeting Name",   // User-controlled via Targeting Lookup tab (e.g. Sauna Interest)
  "Geo",
  // Ad Set-level
  "Space Type",
  "Targeting Tactic", // Interest | LAL 1% | LAL 2% | Retargeting - Checkout | etc.
  "Placement",
  // Ad-level
  "Angle",
  "Format Type", "Length", "Aspect Ratio", "CTA",
  // Creative
  "Hook Copy", "Opt. Event",
  // Metrics
  "Spend ($)", "Impressions", "Reach", "Link Clicks",
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  "Video Views 100%",
] as const

// ── Raw row type ───────────────────────────────────────────────────────────
export type RawRow = {
  date: string
  campaign_id: string; campaign_name: string
  adset_id: string;    adset_name: string
  ad_id: string;       ad_name: string
  spend: number; impressions: number; clicks: number
  purchases: number; revenue: number
  video_views_100pct?: number
  become_host_click?: number
  host_onboarding_started?: number
  listing_created?: number
  reach?: number
  hook_copy?: string
}

// ── Clean row builder ──────────────────────────────────────────────────────
export function cleanRow(raw: RawRow, platformFallback: string): string[] {
  const parsed = parseNamingConvention(raw.ad_name || raw.adset_name || raw.campaign_name)
  const platform = parsed.platform || platformFallback

  const na  = (v: string | undefined) => (!v || v === "-" || v === "—" ? "NA" : v)
  const tc  = (s: string | undefined) => {
    if (!s || s === "NA") return "NA"
    if (/^[CP]\d{3}$/.test(s) || /^(AS|AD)\d{3}$/.test(s) || /^P\d$/.test(s)) return s
    return s.replace(/_/g," ").replace(/\w\S*/g, (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  }

  // Targeting Tactic: combines audienceSource + audienceTier into LAL 1% / Interest / etc.
  const tactic = (() => {
    const src  = parsed.audienceSource
    const tier = parsed.audienceTier
    if (src === "LAL" && tier && tier !== "—") return `LAL ${tier}`
    if (src === "Retargeting" && tier && tier !== "—") return `Retargeting - ${tc(tier)}`
    return na(src)
  })()

  // Date dimensions
  const d       = new Date(raw.date + "T12:00:00Z")
  const year    = String(d.getUTCFullYear())
  const month   = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const tmp     = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow     = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  const mon     = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() || 7) - 1))
  const sun     = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const pad     = (n: number) => String(n).padStart(2, "0")
  const yy      = String(d.getUTCFullYear()).slice(2)
  const week    = `Week ${weekNum} (${pad(mon.getUTCMonth()+1)}/${pad(mon.getUTCDate())} - ${pad(sun.getUTCMonth()+1)}/${pad(sun.getUTCDate())}/${yy})`

  return [
    raw.date, year, month, week,
    na(platform),
    na(raw.campaign_id ?? ""), na(raw.adset_id ?? ""), na(raw.ad_id ?? ""),
    na(raw.campaign_name), na(raw.adset_name), na(raw.ad_name),
    na(parsed.phase), na(tc(parsed.campaignObjective)), na(tc(parsed.funnelStage)),
    na(tc(parsed.audienceGroup)),
    "NA",  // Targeting Name: filled by reporting agent via Targeting Lookup post-process
    na(tc(parsed.geo)),
    na(tc(parsed.spaceType)), na(tactic), na(tc(parsed.placement)),
    na(tc(parsed.angle)),
    na(tc(parsed.formatType)), na(parsed.formatLength), na(parsed.formatRatio), na(tc(parsed.cta?.replace(/_/g," "))),
    na(raw.hook_copy ?? ""), na(parsed.optEvent),
    fmt(raw.spend), String(raw.impressions),
    String(raw.reach ?? raw.impressions), String(raw.clicks),
    String(raw.become_host_click ?? 0),
    String(raw.host_onboarding_started ?? 0),
    String(raw.listing_created ?? 0),
    String(raw.purchases ?? 0),
    String(raw.video_views_100pct ?? 0),
  ]
}

export async function upsertPlatformData(
  sheets: Sheets,
  masterId: string, date: string, platform: string, newRows: string[][]
): Promise<void> {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: masterId, range: "Platform Data!A1:AZ50000",
  })
  const rows = existing.data.values ?? []
  // Rows from an older column layout would sit under the wrong headers; start fresh if so.
  const headerMatches = rows.length > 0 && rows[0].join("|") === CLEANED_HEADERS.join("|")
  const iPlatform = CLEANED_HEADERS.indexOf("Platform")
  const body = headerMatches
    ? rows.slice(1).filter((r) => !(r[0] === date && r[iPlatform] === platform))
    : []
  const updated = [[...CLEANED_HEADERS], ...body, ...newRows]
  await sheets.spreadsheets.values.clear({ spreadsheetId: masterId, range: "Platform Data!A1:AZ50000" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: masterId, range: "Platform Data!A1",
    valueInputOption: "RAW", requestBody: { values: updated },
  })
}
