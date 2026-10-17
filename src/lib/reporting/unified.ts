/**
 * Unified paid media report: one row per day × platform × ad.
 *
 * Inputs (all keyed by platform IDs, never by name):
 *   - report_platform_daily  spend / delivery / platform conversions (Meta + Google)
 *   - report_ga4_daily       GA4 sessions and funnel events by UTM (utm_content = ad ID)
 *   - bookings               first-party bookings stamped with first-touch UTMs
 *   - campaigns / ad_sets / ads  the namer (synced nightly) → names and naming fields
 *
 * Names and naming fields are looked up at read time, so a fix in the namer sheet fixes every
 * past day on the next run. Platform names are only a fallback for ads that aren't in the namer.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { parseNamingConvention } from "@/lib/agent/naming-parser"

// ── Types ──────────────────────────────────────────────────────────────────

export type PlatformDailyRow = {
  date: string
  platform: "meta" | "google"
  ad_id: string
  adset_id: string
  campaign_id: string
  ad_name: string
  adset_name: string
  campaign_name: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  link_clicks: number
  conversions: Record<string, number>
  revenue: number
  is_test?: boolean
}

export type Ga4DailyRow = {
  date: string
  source: string
  medium: string
  campaign: string
  utm_id: string
  term: string
  content: string
  sessions: number
  engaged_sessions: number
  events: Record<string, number>
  revenue: number
  is_test?: boolean
}

export type LookupEntry = {
  level: "campaign" | "ad_set" | "ad"
  platform: string
  platform_id: string
  legacy_id: string
  name: string
  campaign_legacy: string
  campaign_name: string
  ad_set_legacy: string
  ad_set_name: string
  persona: string
  service: string
  geo: string
  phase: string
  funnel: string
  opt_event: string
  audience_src: string
  placement: string
  angle: string
  format: string
  cta: string
  test_variant: string
  hook_copy: string
  status: string
}

export type UnifiedRow = Record<(typeof UNIFIED_HEADERS)[number], string | number>

// ── Columns ────────────────────────────────────────────────────────────────
// Spend must stay in column AB: the Finance Tracker P&L sums 'Platform Data'!AB:AB.

export const UNIFIED_HEADERS = [
  "Date", "Year", "Month", "Week", "Platform",
  "Campaign ID", "Ad Set ID", "Ad ID",
  "Campaign Name", "Ad Set Name", "Ad Name",
  "Namer Campaign", "Namer Ad Set", "Namer Ad",
  "Persona", "Service", "Geo", "Phase", "Funnel",
  "Audience Src", "Placement", "Angle", "Format", "CTA", "Test / Variant", "Hook Copy",
  "Opt. Event",
  "Spend ($)", // AB
  "Impressions", "Reach", "Clicks", "Link Clicks",
  "Results (Opt. Event)",
  "BH (platform)", "HO (platform)", "NL (platform)", "VC (platform)", "IC (platform)", "Purchases (platform)",
  "Revenue (platform)",
  "Sessions (GA4)", "Engaged Sessions (GA4)", "View Listing (GA4)", "Begin Checkout (GA4)",
  "Purchases (GA4)", "Revenue (GA4)",
  "become_host_click (GA4)", "host_onboarding_started (GA4)", "host_first_listing_created (GA4)",
  "Bookings (thrml)", "Booking Revenue (thrml)",
  "CTR", "CPC", "CPM", "Cost / Result", "Cost / Session",
  "ROAS (platform)", "ROAS (GA4)", "ROAS (thrml)",
  "In Namer",
] as const

export const SPEND_COLUMN_LETTER = "AB"

export const LOOKUP_HEADERS = [
  "Level", "Platform", "Platform ID", "Namer ID", "Name",
  "Namer Campaign", "Campaign Name", "Namer Ad Set", "Ad Set Name",
  "Persona", "Service", "Geo", "Phase", "Funnel", "Opt. Event",
  "Audience Src", "Placement", "Angle", "Format", "CTA", "Test / Variant", "Hook Copy", "Status",
] as const

export const GA4_HEADERS = [
  "Date", "Source", "Medium", "utm_campaign", "utm_id", "utm_term (ad set ID)", "utm_content (ad ID)",
  "Matched Ad", "Sessions", "Engaged Sessions", "View Listing", "Begin Checkout", "Purchases", "Revenue",
  "become_host_click", "host_onboarding_started", "host_first_listing_created",
] as const

// ── Helpers ────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100
const ratio = (a: number, b: number, dp = 2) => (b > 0 ? Math.round((a / b) * 10 ** dp) / 10 ** dp : "")

function isoWeek(date: string): { year: string; month: string; week: string } {
  const d = new Date(`${date}T12:00:00Z`)
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7)
  return {
    year: String(d.getUTCFullYear()),
    month: date.slice(0, 7),
    week: `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`,
  }
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = new Date(`${from}T00:00:00Z`); t.toISOString().slice(0, 10) <= to; t.setUTCDate(t.getUTCDate() + 1)) {
    out.push(t.toISOString().slice(0, 10))
  }
  return out
}

export function utcDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const PLATFORM_DB: Record<string, "meta" | "google"> = { META: "meta", GOOG: "google" }
const platKey = (p: unknown) => PLATFORM_DB[String(p)] ?? String(p ?? "").toLowerCase()

async function selectAll<T>(q: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

// ── Lookup (from the namer tables) ─────────────────────────────────────────

export type Lookup = {
  entries: LookupEntry[]
  /** platform key `${platform}:${id}` → entry; test rows use `TEST_<namer id>` as the id */
  ad: Map<string, LookupEntry>
  adSet: Map<string, LookupEntry>
  campaign: Map<string, LookupEntry>
}

export async function loadLookup(admin: SupabaseClient): Promise<Lookup> {
  const [{ data: campaigns }, { data: sets }, { data: ads }] = await Promise.all([
    admin.from("campaigns").select("id, legacy_id, name, platform, persona, service, geo, phase, funnel, event, status, platform_campaign_id"),
    admin.from("ad_sets").select("id, legacy_id, name, campaign_id, audience_src, placement, conv_event, status, platform_adset_id"),
    admin.from("ads").select("id, legacy_id, name, campaign_id, ad_set_id, test_id, variant, angle, format, cta, hook_copy, conv_event, status, platform_ad_id"),
  ])
  const cById = new Map((campaigns ?? []).map((c) => [c.id as string, c]))
  const sById = new Map((sets ?? []).map((s) => [s.id as string, s]))
  const s = (v: unknown) => (v == null ? "" : String(v))

  const entries: LookupEntry[] = []
  const lk: Lookup = { entries, ad: new Map(), adSet: new Map(), campaign: new Map() }
  const index = (map: Map<string, LookupEntry>, e: LookupEntry, platformId: unknown) => {
    const plat = e.platform
    if (platformId) map.set(`${plat}:${String(platformId)}`, e)
    map.set(`${plat}:TEST_${e.legacy_id}`, e)
  }

  for (const c of campaigns ?? []) {
    const e: LookupEntry = {
      level: "campaign",
      platform: platKey(c.platform),
      platform_id: s(c.platform_campaign_id),
      legacy_id: s(c.legacy_id),
      name: s(c.name),
      campaign_legacy: s(c.legacy_id),
      campaign_name: s(c.name),
      ad_set_legacy: "",
      ad_set_name: "",
      persona: s(c.persona),
      service: s(c.service),
      geo: s(c.geo),
      phase: s(c.phase),
      funnel: s(c.funnel),
      opt_event: s(c.event),
      audience_src: "",
      placement: "",
      angle: "",
      format: "",
      cta: "",
      test_variant: "",
      hook_copy: "",
      status: s(c.status),
    }
    entries.push(e)
    index(lk.campaign, e, c.platform_campaign_id)
  }
  for (const a of sets ?? []) {
    const c = cById.get(a.campaign_id as string)
    if (!c) continue
    const e: LookupEntry = {
      ...lk.campaign.get(`${platKey(c.platform)}:TEST_${c.legacy_id}`)!,
      level: "ad_set",
      platform_id: s(a.platform_adset_id),
      legacy_id: s(a.legacy_id),
      name: s(a.name),
      ad_set_legacy: s(a.legacy_id),
      ad_set_name: s(a.name),
      opt_event: s(a.conv_event) || s(c.event),
      audience_src: s(a.audience_src),
      placement: s(a.placement),
      status: s(a.status),
    }
    entries.push(e)
    index(lk.adSet, e, a.platform_adset_id)
  }
  for (const ad of ads ?? []) {
    const set = sById.get(ad.ad_set_id as string)
    const c = cById.get(ad.campaign_id as string)
    if (!set || !c) continue
    const parent = lk.adSet.get(`${platKey(c.platform)}:TEST_${set.legacy_id}`)
    if (!parent) continue
    const e: LookupEntry = {
      ...parent,
      level: "ad",
      platform_id: s(ad.platform_ad_id),
      legacy_id: s(ad.legacy_id),
      name: s(ad.name),
      opt_event: s(ad.conv_event) || parent.opt_event,
      angle: s(ad.angle),
      format: s(ad.format),
      cta: s(ad.cta),
      test_variant: [s(ad.test_id), s(ad.variant)].filter(Boolean).join(" / "),
      hook_copy: s(ad.hook_copy),
      status: s(ad.status),
    }
    entries.push(e)
    index(lk.ad, e, ad.platform_ad_id)
  }
  return lk
}

export function lookupToValues(lk: Lookup): (string | number)[][] {
  const order = { campaign: 0, ad_set: 1, ad: 2 }
  const rows = [...lk.entries].sort(
    (a, b) => a.campaign_legacy.localeCompare(b.campaign_legacy) || order[a.level] - order[b.level] || a.legacy_id.localeCompare(b.legacy_id)
  )
  return [
    [...LOOKUP_HEADERS],
    ...rows.map((e) => [
      e.level, e.platform, e.platform_id, e.legacy_id, e.name,
      e.campaign_legacy, e.campaign_name, e.ad_set_legacy, e.ad_set_name,
      e.persona, e.service, e.geo, e.phase, e.funnel, e.opt_event,
      e.audience_src, e.placement, e.angle, e.format, e.cta, e.test_variant, e.hook_copy, e.status,
    ]),
  ]
}

// ── Build ──────────────────────────────────────────────────────────────────

const GA4_EVENT_KEYS = {
  view: ["view_item", "view_listing"],
  checkout: ["begin_checkout"],
  purchase: ["purchase"],
  bh: ["become_host_click"],
  ho: ["host_onboarding_started"],
  nl: ["host_first_listing_created"],
}
const ev = (events: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (Number(events[k]) || 0), 0)

export type UnifiedBuild = {
  rows: UnifiedRow[]
  ga4Rows: (string | number)[][]
  lookup: Lookup
}

export async function buildUnified(
  admin: SupabaseClient,
  opts: { from: string; to: string; test?: boolean; lookup?: Lookup }
): Promise<UnifiedBuild> {
  const test = Boolean(opts.test)
  const lookup = opts.lookup ?? (await loadLookup(admin))

  const [platformRows, ga4, bookings] = await Promise.all([
    selectAll<PlatformDailyRow>(() =>
      admin.from("report_platform_daily").select("*").eq("is_test", test).gte("date", opts.from).lte("date", opts.to).order("date")
    ),
    selectAll<Ga4DailyRow>(() =>
      admin.from("report_ga4_daily").select("*").eq("is_test", test).gte("date", opts.from).lte("date", opts.to)
    ),
    test
      ? Promise.resolve([] as { created_at: string; utm_content: string | null; total_charged: number | null }[])
      : selectAll<{ created_at: string; utm_content: string | null; total_charged: number | null }>(() =>
          admin
            .from("bookings")
            .select("created_at, utm_content, total_charged")
            .not("utm_content", "is", null)
            .in("status", ["confirmed", "completed", "pending_host"])
            .gte("created_at", `${opts.from}T00:00:00Z`)
            .lte("created_at", `${opts.to}T23:59:59Z`)
        ),
  ])

  // GA4 → ad by utm_content (ad ID); test data uses the same convention.
  const ga4ByKey = new Map<string, { sessions: number; engaged: number; events: Record<string, number>; revenue: number }>()
  const ga4Values: (string | number)[][] = [[...GA4_HEADERS]]
  const knownAds = new Set(platformRows.map((r) => r.ad_id))
  for (const g of ga4) {
    const key = `${g.date}|${g.content}`
    const matched = Boolean(g.content && knownAds.has(g.content))
    if (matched) {
      const cur = ga4ByKey.get(key) ?? { sessions: 0, engaged: 0, events: {}, revenue: 0 }
      cur.sessions += Number(g.sessions) || 0
      cur.engaged += Number(g.engaged_sessions) || 0
      cur.revenue += Number(g.revenue) || 0
      for (const [k, v] of Object.entries(g.events ?? {})) cur.events[k] = (cur.events[k] ?? 0) + (Number(v) || 0)
      ga4ByKey.set(key, cur)
    }
    const e = g.events ?? {}
    ga4Values.push([
      g.date, g.source, g.medium, g.campaign, g.utm_id, g.term, g.content,
      matched ? "yes" : "no",
      g.sessions, g.engaged_sessions,
      ev(e, GA4_EVENT_KEYS.view), ev(e, GA4_EVENT_KEYS.checkout), ev(e, GA4_EVENT_KEYS.purchase), round2(Number(g.revenue) || 0),
      ev(e, GA4_EVENT_KEYS.bh), ev(e, GA4_EVENT_KEYS.ho), ev(e, GA4_EVENT_KEYS.nl),
    ])
  }

  const bookingsByKey = new Map<string, { n: number; revenue: number }>()
  for (const b of bookings) {
    const key = `${b.created_at.slice(0, 10)}|${b.utm_content}`
    const cur = bookingsByKey.get(key) ?? { n: 0, revenue: 0 }
    cur.n += 1
    cur.revenue += Number(b.total_charged) || 0
    bookingsByKey.set(key, cur)
  }

  const rows: UnifiedRow[] = platformRows.map((p) => {
    const k = (id: string) => `${p.platform}:${id}`
    const adE = lookup.ad.get(k(p.ad_id))
    const setE = adE ?? lookup.adSet.get(k(p.adset_id))
    const campE = setE ?? lookup.campaign.get(k(p.campaign_id))
    const parsed = campE ? null : parseNamingConvention(p.ad_name || p.adset_name || p.campaign_name)
    const conv = p.conversions ?? {}
    const optEvent = adE?.opt_event || setE?.opt_event || campE?.opt_event || parsed?.optEvent || ""
    const results = optEvent ? Number(conv[optEvent]) || 0 : 0
    const g = ga4ByKey.get(`${p.date}|${p.ad_id}`)
    const bk = bookingsByKey.get(`${p.date}|${p.ad_id}`)
    const spend = Number(p.spend) || 0
    const impressions = Number(p.impressions) || 0
    const clicks = Number(p.clicks) || 0
    const { year, month, week } = isoWeek(p.date)
    const ga4Revenue = g?.revenue ?? 0

    return {
      Date: p.date,
      Year: year,
      Month: month,
      Week: week,
      Platform: p.platform === "meta" ? "Meta" : "Google Ads",
      "Campaign ID": p.campaign_id,
      "Ad Set ID": p.adset_id,
      "Ad ID": p.ad_id,
      "Campaign Name": campE?.campaign_name || p.campaign_name,
      "Ad Set Name": setE?.ad_set_name || p.adset_name,
      "Ad Name": adE?.name || p.ad_name,
      "Namer Campaign": campE?.campaign_legacy ?? "",
      "Namer Ad Set": setE?.ad_set_legacy ?? "",
      "Namer Ad": adE?.legacy_id ?? "",
      Persona: campE?.persona || parsed?.audienceGroup || "",
      Service: campE?.service || parsed?.spaceType || "",
      Geo: campE?.geo || parsed?.geo || "",
      Phase: campE?.phase || parsed?.phase || "",
      Funnel: campE?.funnel || parsed?.funnelStage || "",
      "Audience Src": setE?.audience_src || parsed?.audSrcRaw || "",
      Placement: setE?.placement || parsed?.placement || "",
      Angle: adE?.angle || parsed?.angle || "",
      Format: adE?.format || parsed?.formatType || "",
      CTA: adE?.cta || parsed?.cta || "",
      "Test / Variant": adE?.test_variant ?? "",
      "Hook Copy": adE?.hook_copy ?? "",
      "Opt. Event": optEvent,
      "Spend ($)": round2(spend),
      Impressions: impressions,
      Reach: Number(p.reach) || 0,
      Clicks: clicks,
      "Link Clicks": Number(p.link_clicks) || 0,
      "Results (Opt. Event)": results,
      "BH (platform)": Number(conv.BH) || 0,
      "HO (platform)": Number(conv.HO) || 0,
      "NL (platform)": Number(conv.NL) || 0,
      "VC (platform)": Number(conv.VC) || 0,
      "IC (platform)": Number(conv.IC) || 0,
      "Purchases (platform)": Number(conv.PUR) || 0,
      "Revenue (platform)": round2(Number(p.revenue) || 0),
      "Sessions (GA4)": g?.sessions ?? 0,
      "Engaged Sessions (GA4)": g?.engaged ?? 0,
      "View Listing (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.view) : 0,
      "Begin Checkout (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.checkout) : 0,
      "Purchases (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.purchase) : 0,
      "Revenue (GA4)": round2(ga4Revenue),
      "become_host_click (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.bh) : 0,
      "host_onboarding_started (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.ho) : 0,
      "host_first_listing_created (GA4)": g ? ev(g.events, GA4_EVENT_KEYS.nl) : 0,
      "Bookings (thrml)": bk?.n ?? 0,
      "Booking Revenue (thrml)": round2(bk?.revenue ?? 0),
      CTR: ratio(clicks, impressions, 4),
      CPC: ratio(spend, clicks),
      CPM: impressions > 0 ? round2((spend / impressions) * 1000) : "",
      "Cost / Result": ratio(spend, results),
      "Cost / Session": ratio(spend, g?.sessions ?? 0),
      "ROAS (platform)": ratio(Number(p.revenue) || 0, spend),
      "ROAS (GA4)": ratio(ga4Revenue, spend),
      "ROAS (thrml)": ratio(bk?.revenue ?? 0, spend),
      "In Namer": adE ? "yes" : setE || campE ? "partial" : "no",
    }
  })

  return { rows, ga4Rows: ga4Values, lookup }
}

export function unifiedToValues(rows: UnifiedRow[]): (string | number)[][] {
  return [[...UNIFIED_HEADERS], ...rows.map((r) => UNIFIED_HEADERS.map((h) => r[h] ?? ""))]
}

export function toCsv(values: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return values.map((r) => r.map(cell).join(",")).join("\n")
}
