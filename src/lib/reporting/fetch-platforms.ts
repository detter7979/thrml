/**
 * Ad-level daily pulls for the unified report, over a date range (default: the last 45 days, so
 * late-attributed conversions are restated every night).
 */
import { META_GRAPH_BASE, getMetaMarketingApiToken } from "@/lib/agent/meta-api"
import {
  type MetaAction,
  fetchCustomConversionEventMap,
  getMetaAdAccountId,
  isEmptyAccountError,
  mapMetaActionsToEvents,
  purchaseRevenueUsd,
} from "@/lib/agent/meta-ads-api"
import { googleAdsConfigured, googleAdsSearch } from "@/lib/agent/google-ads-api"

import type { PlatformDailyRow } from "./unified"

export type RawSheet = { headers: string[]; rows: (string | number)[][] }

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Meta ───────────────────────────────────────────────────────────────────

const META_FIELDS = [
  "date_start", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks", "actions", "action_values",
]

export async function fetchMetaAdDaily(since: string, until: string): Promise<{ rows: PlatformDailyRow[]; raw: RawSheet }> {
  if (!process.env.META_MARKETING_API_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    return { rows: [], raw: { headers: [], rows: [] } }
  }
  const act = getMetaAdAccountId()
  const ccMap = await fetchCustomConversionEventMap(act).catch(() => new Map<string, string>())
  const params = new URLSearchParams({
    access_token: getMetaMarketingApiToken(),
    fields: META_FIELDS.join(","),
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  })
  const data: Record<string, unknown>[] = []
  let url: string | null = `${META_GRAPH_BASE}/${act}/insights?${params.toString()}`
  while (url) {
    const res = await fetch(url)
    const json = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>[]
      paging?: { next?: string }
      error?: { code?: number; message?: string }
    }
    if (json.error) {
      if (isEmptyAccountError(json.error)) break
      throw new Error(`Meta insights: ${json.error.message}`)
    }
    data.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }

  const rawHeaders = [
    "date", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
    "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks", "actions", "action_values",
  ]
  const actStr = (a: unknown) =>
    ((a as MetaAction[] | undefined) ?? []).map((x) => `${x.action_type}=${x.value ?? ""}`).join("; ")

  const rows: PlatformDailyRow[] = []
  const raw: (string | number)[][] = []
  for (const r of data) {
    const actions = (r.actions as MetaAction[] | undefined) ?? []
    const conv: Record<string, number> = {}
    for (const { event_t, conversions } of mapMetaActionsToEvents(actions, ccMap)) conv[event_t] = conversions
    const date = String(r.date_start ?? since)
    rows.push({
      date,
      platform: "meta",
      ad_id: String(r.ad_id ?? ""),
      adset_id: String(r.adset_id ?? ""),
      campaign_id: String(r.campaign_id ?? ""),
      ad_name: String(r.ad_name ?? ""),
      adset_name: String(r.adset_name ?? ""),
      campaign_name: String(r.campaign_name ?? ""),
      spend: num(r.spend),
      impressions: num(r.impressions),
      reach: num(r.reach),
      clicks: num(r.clicks),
      link_clicks: num(r.inline_link_clicks),
      conversions: conv,
      revenue: purchaseRevenueUsd(r.action_values as MetaAction[] | undefined),
    })
    raw.push([
      date, String(r.campaign_id ?? ""), String(r.campaign_name ?? ""), String(r.adset_id ?? ""), String(r.adset_name ?? ""),
      String(r.ad_id ?? ""), String(r.ad_name ?? ""), num(r.spend), num(r.impressions), num(r.reach), num(r.frequency),
      num(r.clicks), num(r.inline_link_clicks), actStr(r.actions), actStr(r.action_values),
    ])
  }
  return { rows, raw: { headers: rawHeaders, rows: raw } }
}

// ── Google Ads ─────────────────────────────────────────────────────────────

/** Google conversion action name → our event code (by keyword, so it survives renames like "thrml – Purchase"). */
export function googleConversionEvent(name: string): string | null {
  const n = name.toLowerCase()
  if (/purchase|booking/.test(n)) return "PUR"
  if (/checkout/.test(n)) return "IC"
  if (/view.?(item|listing|content)/.test(n)) return "VC"
  if (/first.?listing|listing.?created/.test(n)) return "NL"
  if (/onboarding/.test(n)) return "HO"
  if (/become.?host|host.?click/.test(n)) return "BH"
  if (/lead|newsletter|sign.?up/.test(n)) return "LEAD"
  return null
}

type Obj = Record<string, unknown>
const pick = (row: Obj, a: string, b: string) => (row[a] ?? row[b]) as Obj | undefined

export async function fetchGoogleAdDaily(since: string, until: string): Promise<{ rows: PlatformDailyRow[]; raw: RawSheet }> {
  if (!googleAdsConfigured()) return { rows: [], raw: { headers: [], rows: [] } }
  const where = `segments.date BETWEEN '${since}' AND '${until}'`
  const [base, byAction] = await Promise.all([
    googleAdsSearch(`
      SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
             ad_group_ad.ad.id, ad_group_ad.ad.name,
             metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE ${where} AND metrics.impressions > 0`),
    googleAdsSearch(`
      SELECT segments.date, ad_group_ad.ad.id, segments.conversion_action_name, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE ${where} AND metrics.conversions > 0`),
  ])

  const convByKey = new Map<string, { conv: Record<string, number>; revenue: number }>()
  for (const r of byAction) {
    const seg = pick(r, "segments", "Segments") ?? {}
    const ad = (pick(r, "adGroupAd", "ad_group_ad")?.ad ?? {}) as Obj
    const m = pick(r, "metrics", "Metrics") ?? {}
    const key = `${seg.date}|${ad.id}`
    const cur = convByKey.get(key) ?? { conv: {}, revenue: 0 }
    const ev = googleConversionEvent(String(seg.conversionActionName ?? seg.conversion_action_name ?? ""))
    if (ev) cur.conv[ev] = (cur.conv[ev] ?? 0) + Math.round(num(m.conversions))
    if (ev === "PUR") cur.revenue += num(m.conversionsValue ?? m.conversions_value)
    convByKey.set(key, cur)
  }

  const headers = [
    "date", "campaign_id", "campaign_name", "ad_group_id", "ad_group_name", "ad_id", "ad_name",
    "cost", "impressions", "clicks", "conversions", "conversions_value",
  ]
  const rows: PlatformDailyRow[] = []
  const raw: (string | number)[][] = []
  for (const r of base) {
    const seg = pick(r, "segments", "Segments") ?? {}
    const c = pick(r, "campaign", "Campaign") ?? {}
    const g = pick(r, "adGroup", "ad_group") ?? {}
    const ad = (pick(r, "adGroupAd", "ad_group_ad")?.ad ?? {}) as Obj
    const m = pick(r, "metrics", "Metrics") ?? {}
    const date = String(seg.date ?? since)
    const spend = num(m.costMicros ?? m.cost_micros) / 1_000_000
    const extra = convByKey.get(`${date}|${ad.id}`)
    rows.push({
      date,
      platform: "google",
      ad_id: String(ad.id ?? ""),
      adset_id: String(g.id ?? ""),
      campaign_id: String(c.id ?? ""),
      ad_name: String(ad.name ?? ""),
      adset_name: String(g.name ?? ""),
      campaign_name: String(c.name ?? ""),
      spend,
      impressions: num(m.impressions),
      reach: 0,
      clicks: num(m.clicks),
      link_clicks: num(m.clicks),
      conversions: extra?.conv ?? {},
      revenue: extra?.revenue ?? 0,
    })
    raw.push([
      date, String(c.id ?? ""), String(c.name ?? ""), String(g.id ?? ""), String(g.name ?? ""), String(ad.id ?? ""),
      String(ad.name ?? ""), Math.round(spend * 100) / 100, num(m.impressions), num(m.clicks), num(m.conversions),
      num(m.conversionsValue ?? m.conversions_value),
    ])
  }
  return { rows, raw: { headers, rows: raw } }
}
