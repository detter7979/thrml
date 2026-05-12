/**
 * Meta Marketing API — insights + campaign listing (HTTP only, no SDK).
 * Env: META_ACCESS_TOKEN or META_MARKETING_API_TOKEN (legacy), META_AD_ACCOUNT_ID, optional META_API_VERSION (default v21.0).
 */

export type MetaAction = { action_type: string; value?: string }

export type MetaCampaign = {
  id: string
  name: string
  effective_status?: string
  status?: string
}

/** One normalized insight slice per calendar day (UTC) from Meta, before DB conv_event split. */
export type MetaInsightRow = {
  date: string
  level: "account" | "campaign" | "adset" | "ad"
  platform_entity_id: string
  impressions: number
  reach: number | null
  clicks: number
  link_clicks: number | null
  spend_usd: number
  cpm: number | null
  cpc: number | null
  ctr: number | null
  frequency: number | null
  actions: MetaAction[]
  action_values: MetaAction[]
  raw_payload: Record<string, unknown>
}

function graphBase(): string {
  const v = (process.env.META_API_VERSION ?? "v21.0").replace(/^v/, "v")
  return `https://graph.facebook.com/${v}`
}

export function getMetaAccessToken(): string {
  const t = process.env.META_ACCESS_TOKEN ?? process.env.META_MARKETING_API_TOKEN
  if (!t) throw new Error("META_ACCESS_TOKEN or META_MARKETING_API_TOKEN is required")
  return t
}

export function getMetaAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set")
  return id.startsWith("act_") ? id : `act_${id.replace(/^act_/, "")}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const delays = [1000, 2000, 4000]
  let lastErr: unknown
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        const body = await res.text().catch(() => "")
        lastErr = new Error(`Meta HTTP ${res.status}: ${body.slice(0, 200)}`)
        if (attempt < 3) await sleep(delays[attempt] ?? 4000)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt < 3) await sleep(delays[attempt] ?? 4000)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normCtr(raw: number, impressions: number, clicks: number): number | null {
  if (!raw && impressions <= 0) return null
  if (raw > 1) return raw / 100
  if (impressions > 0) return clicks / impressions
  return raw || null
}

const INSIGHT_FIELDS = [
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "spend",
  "cpm",
  "cpc",
  "ctr",
  "frequency",
  "actions",
  "action_values",
  "campaign_id",
  "adset_id",
  "ad_id",
  "date_start",
  "date_stop",
].join(",")

function platformIdForLevel(
  level: MetaInsightRow["level"],
  row: Record<string, unknown>
): string {
  if (level === "account") return String(row.account_id ?? row.ad_account_id ?? getMetaAdAccountId())
  if (level === "campaign") return String(row.campaign_id ?? "")
  if (level === "adset") return String(row.adset_id ?? "")
  return String(row.ad_id ?? "")
}

function mapGraphRow(
  level: MetaInsightRow["level"],
  row: Record<string, unknown>,
  dateStart: string,
  dateEnd: string,
  graphObjectId?: string
): MetaInsightRow[] {
  const dateStr = String(row.date_start ?? row.date_stop ?? "")
  if (dateStr && (dateStr < dateStart || dateStr > dateEnd)) return []

  const impressions = num(row.impressions)
  const clicks = num(row.clicks)
  const ctrRaw = num(row.ctr)
  const peid =
    level === "account" && graphObjectId
      ? graphObjectId
      : platformIdForLevel(level, row)
  const out: MetaInsightRow = {
    date: dateStr || dateStart,
    level,
    platform_entity_id: peid,
    impressions,
    reach: row.reach === undefined || row.reach === "" ? null : num(row.reach),
    clicks,
    link_clicks:
      row.inline_link_clicks === undefined || row.inline_link_clicks === ""
        ? null
        : num(row.inline_link_clicks),
    spend_usd: num(row.spend),
    cpm: row.cpm === undefined || row.cpm === "" ? null : num(row.cpm),
    cpc: row.cpc === undefined || row.cpc === "" ? null : num(row.cpc),
    ctr: normCtr(ctrRaw, impressions, clicks),
    frequency: row.frequency === undefined || row.frequency === "" ? null : num(row.frequency),
    actions: (row.actions as MetaAction[]) ?? [],
    action_values: (row.action_values as MetaAction[]) ?? [],
    raw_payload: row,
  }
  return [out]
}

async function fetchAllPages(initialUrl: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let url: string | null = initialUrl
  while (url) {
    const res = await fetchWithRetry(url)
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Meta insights error ${res.status}: ${t.slice(0, 500)}`)
    }
    const json = (await res.json()) as {
      data?: Record<string, unknown>[]
      paging?: { next?: string }
      error?: { message?: string }
    }
    if (json.error?.message) throw new Error(json.error.message)
    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }
  return rows
}

/**
 * Insights for one or more graph object IDs (ad account, campaign, ad set, or ad).
 * Uses time_increment=1 for per-day rows; filters client-side to [dateStart, dateEnd].
 */
export async function fetchInsights(
  level: "account" | "campaign" | "adset" | "ad",
  entityIds: string[],
  dateStart: string,
  dateEnd: string
): Promise<MetaInsightRow[]> {
  const token = encodeURIComponent(getMetaAccessToken())
  const timeRange = encodeURIComponent(JSON.stringify({ since: dateStart, until: dateEnd }))
  const fields = encodeURIComponent(INSIGHT_FIELDS)
  const results: MetaInsightRow[] = []

  for (const rawId of entityIds) {
    const id = rawId.startsWith("act_") || /^\d+$/.test(rawId) ? rawId : rawId
    const url =
      `${graphBase()}/${id}/insights?` +
      `fields=${fields}&time_range=${timeRange}&time_increment=1` +
      `&access_token=${token}`

    const data = await fetchAllPages(url)
    for (const row of data) {
      results.push(...mapGraphRow(level, row, dateStart, dateEnd, id))
    }
  }

  return results
}

export async function fetchActiveCampaigns(adAccountId: string): Promise<MetaCampaign[]> {
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`
  const token = encodeURIComponent(getMetaAccessToken())
  const fields = encodeURIComponent("id,name,status,effective_status")
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }])
  )
  const initial =
    `${graphBase()}/${acct}/campaigns?fields=${fields}&filtering=${filtering}&limit=500&access_token=${token}`

  const rows: MetaCampaign[] = []
  let url: string | null = initial
  while (url) {
    const res = await fetchWithRetry(url)
    if (!res.ok) {
      console.error("[meta-ads-api] fetchActiveCampaigns", await res.text())
      break
    }
    const json = (await res.json()) as {
      data?: MetaCampaign[]
      paging?: { next?: string }
    }
    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }
  return rows
}

/**
 * Map Meta Insights `actions` entries to internal event_t codes.
 */
export function mapMetaActionsToEvents(actions: MetaAction[]): { event_t: string; conversions: number }[] {
  const byEvent = new Map<string, number>()

  const add = (key: string, n: number) => {
    if (n <= 0) return
    byEvent.set(key, (byEvent.get(key) ?? 0) + n)
  }

  for (const a of actions) {
    const t = a.action_type ?? ""
    const v = Math.round(num(a.value))

    if (
      t === "offsite_conversion.fb_pixel_custom.become_host_click" ||
      t === "offsite_conversion.custom.become_host_click" ||
      t === "become_host_click"
    ) {
      add("BH", v)
      continue
    }
    if (
      t === "offsite_conversion.fb_pixel_custom.host_onboarding_started" ||
      t === "offsite_conversion.custom.host_onboarding_started" ||
      t === "host_onboarding_started"
    ) {
      add("HO", v)
      continue
    }
    if (
      t === "offsite_conversion.fb_pixel_custom.listing_created" ||
      t === "offsite_conversion.custom.listing_created" ||
      t === "listing_created"
    ) {
      add("NL", v)
      continue
    }
    if (
      t === "offsite_conversion.fb_pixel_custom.activation" ||
      t === "offsite_conversion.custom.activation" ||
      t === "activation" ||
      t === "omni_activate"
    ) {
      add("NL", v)
      continue
    }
    if (t === "offsite_conversion.fb_pixel_view_content" || t === "view_content") {
      add("VC", v)
      continue
    }
    if (t === "offsite_conversion.fb_pixel_initiate_checkout" || t === "initiate_checkout") {
      add("IC", v)
      continue
    }
    if (
      t === "offsite_conversion.fb_pixel_purchase" ||
      t === "purchase" ||
      t === "omni_purchase" ||
      t === "web_in_store_purchase"
    ) {
      add("PUR", v)
      continue
    }
    if (t === "link_click") {
      // funnel metric, not in event_t — skip
      continue
    }
  }

  return [...byEvent.entries()].map(([event_t, conversions]) => ({ event_t, conversions }))
}

export function purchaseRevenueUsd(actionValues: MetaAction[] | undefined): number {
  if (!actionValues?.length) return 0
  const keys = [
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "omni_purchase",
    "web_in_store_purchase",
  ]
  let max = 0
  for (const k of keys) {
    const row = actionValues.find((x) => x.action_type === k)
    if (row) max = Math.max(max, num(row.value))
  }
  return max
}
