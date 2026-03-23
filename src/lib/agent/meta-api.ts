const BASE = "https://graph.facebook.com/v22.0"

function token() {
  const t = process.env.META_MARKETING_API_TOKEN
  if (!t) throw new Error("META_MARKETING_API_TOKEN is not set")
  return t
}

function adAccount() {
  const id = process.env.META_AD_ACCOUNT_ID
  if (!id) throw new Error("META_AD_ACCOUNT_ID is not set")
  return id
}

export type MetaInsightRow = {
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  ctr: number
  cpa: number
}

function conversionsFromActions(
  conversionEvent: string,
  actions: { action_type: string; value: string }[] | undefined,
  actionValues: { action_type: string; value: string }[] | undefined
) {
  if (conversionEvent === "lead") {
    const leadTypes = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]
    let purchases = 0
    let revenue = 0
    for (const lt of leadTypes) {
      const a = actions?.find((x) => x.action_type === lt)
      if (a) purchases = Math.max(purchases, Number(a.value ?? 0))
    }
    return { purchases, revenue }
  }

  const purchaseTypes = [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "web_in_store_purchase",
  ]
  let purchases = 0
  let revenue = 0
  for (const pt of purchaseTypes) {
    const a = actions?.find((x) => x.action_type === pt)
    if (a) purchases = Math.max(purchases, Number(a.value ?? 0))
    const av = actionValues?.find((x) => x.action_type === pt)
    if (av) revenue = Math.max(revenue, Number(av.value ?? 0))
  }
  return { purchases, revenue }
}

export async function fetchMetaInsights(
  date: string,
  conversionEvent: string = "purchase"
): Promise<MetaInsightRow[]> {
  const fields =
    "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values"
  const timeRange = encodeURIComponent(JSON.stringify({ since: date, until: date }))
  const acct = adAccount()
  const tok = token()

  const rows: Record<string, unknown>[] = []
  let url: string | null =
    `${BASE}/${acct}/insights?fields=${encodeURIComponent(fields)}` +
    `&time_range=${timeRange}&level=ad&access_token=${encodeURIComponent(tok)}&limit=500`

  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Meta insights error: ${await res.text()}`)
    const json = (await res.json()) as {
      data?: Record<string, unknown>[]
      paging?: { next?: string }
    }
    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }

  return rows.map((row) => {
    const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? []
    const actionValues =
      (row.action_values as { action_type: string; value: string }[] | undefined) ?? []
    const { purchases, revenue } = conversionsFromActions(conversionEvent, actions, actionValues)
    const spend = Number(row.spend ?? 0)
    const impressions = Number(row.impressions ?? 0)
    const clicks = Number(row.clicks ?? 0)
    return {
      campaign_id: String(row.campaign_id ?? ""),
      campaign_name: String(row.campaign_name ?? ""),
      adset_id: String(row.adset_id ?? ""),
      adset_name: String(row.adset_name ?? ""),
      ad_id: String(row.ad_id ?? ""),
      ad_name: String(row.ad_name ?? ""),
      spend,
      impressions,
      clicks,
      purchases,
      revenue,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpa: purchases > 0 ? spend / purchases : 0,
    }
  })
}

export async function pauseAdSet(adsetId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/${adsetId}?status=PAUSED&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  )
  return res.ok
}

export async function resumeAdSet(adsetId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/${adsetId}?status=ACTIVE&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  )
  return res.ok
}

export async function pauseAd(adId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/${adId}?status=PAUSED&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  )
  return res.ok
}

export async function resumeAd(adId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/${adId}?status=ACTIVE&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  )
  return res.ok
}

export async function scaleAdSetBudget(
  adsetId: string,
  currentBudgetDollars: number,
  scalePct: number
): Promise<boolean> {
  const newBudgetCents = Math.round(currentBudgetDollars * (1 + scalePct) * 100)
  const res = await fetch(
    `${BASE}/${adsetId}?daily_budget=${newBudgetCents}&access_token=${encodeURIComponent(token())}`,
    { method: "POST" }
  )
  return res.ok
}

export async function duplicateAdSet(adsetId: string): Promise<string | null> {
  const params = new URLSearchParams({
    access_token: token(),
    deep_copy: "true",
    status_option: "PAUSED",
  })
  const res = await fetch(`${BASE}/${adsetId}/copies?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { copied_adset_id?: string }
  return data.copied_adset_id ?? null
}

export async function fetchMarketingObjectStatus(objectId: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/${objectId}?fields=effective_status,status&access_token=${encodeURIComponent(token())}`
  )
  if (!res.ok) return null
  const json = (await res.json()) as { effective_status?: string; status?: string }
  return json.effective_status ?? json.status ?? null
}

export async function fetchActiveAdSets(): Promise<
  { id: string; name: string; daily_budget: string; campaign_id: string }[]
> {
  const fields = "id,name,daily_budget,campaign_id,effective_status"
  const url =
    `${BASE}/${adAccount()}/adsets?fields=${encodeURIComponent(fields)}` +
    `&access_token=${encodeURIComponent(token())}&limit=200`
  const res = await fetch(url)
  if (!res.ok) return []
  const { data = [] } = (await res.json()) as {
    data: Array<{
      id: string
      name: string
      daily_budget: string
      campaign_id: string
      effective_status?: string
    }>
  }
  return data.filter((a) => a.effective_status === "ACTIVE")
}
