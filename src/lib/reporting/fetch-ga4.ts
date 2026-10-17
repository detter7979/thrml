/**
 * GA4 sessions and funnel events by UTM, per day — the site side of the unified report.
 * utm_content carries the ad ID and utm_term the ad set ID, so rows join to platform data by ID.
 */
import { getGA4AccessToken } from "@/lib/analytics/ga4-auth"
import { envClean } from "@/lib/env"

import type { Ga4DailyRow } from "./unified"

const FUNNEL_EVENTS = [
  "view_item",
  "view_listing",
  "begin_checkout",
  "purchase",
  "become_host_click",
  "host_onboarding_started",
  "host_first_listing_created",
  "sign_up",
  "generate_lead",
]

const UTM_DIMS = [
  "date",
  "sessionSource",
  "sessionMedium",
  "sessionCampaignName",
  "sessionCampaignId",
  "sessionManualTerm",
  "sessionManualAdContent",
]

/** Paid / tagged traffic only: drop direct, organic and plain referral sessions. */
const PAID_FILTER = {
  andGroup: {
    expressions: ["(none)", "organic", "referral"].map((v) => ({
      notExpression: { filter: { fieldName: "sessionMedium", stringFilter: { value: v, matchType: "EXACT" } } },
    })),
  },
}

type ReportRow = { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

async function runReport(body: Record<string, unknown>): Promise<ReportRow[]> {
  const propertyId = envClean("GA4_PROPERTY_ID")
  if (!propertyId) throw new Error("GA4_PROPERTY_ID not set")
  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`
  const token = await getGA4AccessToken()
  const out: ReportRow[] = []
  for (let offset = 0; ; offset += 10000) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, limit: 10000, offset }),
    })
    if (!res.ok) throw new Error(`GA4 runReport ${res.status}: ${(await res.text()).slice(0, 400)}`)
    const json = (await res.json()) as { rows?: ReportRow[]; rowCount?: number }
    out.push(...(json.rows ?? []))
    if (!json.rows || out.length >= (json.rowCount ?? 0)) break
  }
  return out
}

const gaDate = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v)
const clean = (v: string) => (v === "(not set)" || v === "(none)" ? "" : v)

export async function fetchGa4ByUtm(since: string, until: string): Promise<Ga4DailyRow[]> {
  if (!envClean("GA4_PROPERTY_ID")) return []
  const dateRanges = [{ startDate: since, endDate: until }]
  const dims = UTM_DIMS.map((name) => ({ name }))

  const sessions = await runReport({
    dateRanges,
    dimensions: dims,
    metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
    dimensionFilter: PAID_FILTER,
  })

  const eventFilter = {
    andGroup: {
      expressions: [
        PAID_FILTER,
        { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } } },
      ],
    },
  }
  let events: ReportRow[]
  let withRevenue = true
  try {
    events = await runReport({
      dateRanges,
      dimensions: [...dims, { name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "purchaseRevenue" }],
      dimensionFilter: eventFilter,
    })
  } catch {
    withRevenue = false
    events = await runReport({
      dateRanges,
      dimensions: [...dims, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
    })
  }

  const byKey = new Map<string, Ga4DailyRow>()
  const keyOf = (d: { value: string }[]) => d.slice(0, 7).map((x) => x.value).join("|")
  const get = (d: { value: string }[]) => {
    const k = keyOf(d)
    let row = byKey.get(k)
    if (!row) {
      row = {
        date: gaDate(d[0]!.value),
        source: clean(d[1]!.value),
        medium: clean(d[2]!.value),
        campaign: clean(d[3]!.value),
        utm_id: clean(d[4]!.value),
        term: clean(d[5]!.value),
        content: clean(d[6]!.value),
        sessions: 0,
        engaged_sessions: 0,
        events: {},
        revenue: 0,
      }
      byKey.set(k, row)
    }
    return row
  }

  for (const r of sessions) {
    const row = get(r.dimensionValues)
    row.sessions += Number(r.metricValues[0]?.value) || 0
    row.engaged_sessions += Number(r.metricValues[1]?.value) || 0
  }
  for (const r of events) {
    const row = get(r.dimensionValues)
    const name = r.dimensionValues[7]!.value
    row.events[name] = (row.events[name] ?? 0) + (Number(r.metricValues[0]?.value) || 0)
    if (withRevenue && name === "purchase") row.revenue += Number(r.metricValues[1]?.value) || 0
  }
  return [...byKey.values()]
}
