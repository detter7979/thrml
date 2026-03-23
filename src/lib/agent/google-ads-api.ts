// Google Ads API v18 via REST
// https://developers.google.com/google-ads/api/rest

function customerIdRaw() {
  const id = process.env.GOOGLE_ADS_CUSTOMER_ID
  if (!id) throw new Error("GOOGLE_ADS_CUSTOMER_ID is not set")
  return id.replace(/-/g, "")
}

function devToken() {
  const t = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!t) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set")
  return t
}

function baseUrl() {
  return `https://googleads.googleapis.com/v18/customers/${customerIdRaw()}`
}

async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  })
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? res.statusText
    throw new Error(`Google OAuth failed: ${detail}`)
  }
  return json.access_token
}

function gadsHeaders(token: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken(),
    "Content-Type": "application/json",
  }
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "")
  if (login) h["login-customer-id"] = login
  return h
}

function metricsNum(m: Record<string, unknown> | undefined, camel: string, snake: string) {
  if (!m) return 0
  const v = m[camel] ?? m[snake]
  return Number(v ?? 0)
}

export type GoogleInsightRow = {
  campaign_id: string
  campaign_name: string
  adgroup_id: string
  adgroup_name: string
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

export async function fetchGoogleInsights(date: string): Promise<GoogleInsightRow[]> {
  const token = await getGoogleAccessToken()
  const query = `
    SELECT
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      ad_group_ad.ad.id, ad_group_ad.ad.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr
    FROM ad_group_ad
    WHERE segments.date = '${date}'
    AND campaign.status = 'ENABLED'
  `
  const res = await fetch(`${baseUrl()}/googleAds:search`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    console.error("[google-ads] query error", await res.text())
    return []
  }
  const { results = [] } = (await res.json()) as { results: Record<string, unknown>[] }

  return results.map((row) => {
    const campaign = (row.campaign ?? row.Campaign) as Record<string, unknown> | undefined
    const adGroup = (row.adGroup ?? row.ad_group) as Record<string, unknown> | undefined
    const adGroupAd = (row.adGroupAd ?? row.ad_group_ad) as Record<string, Record<string, unknown>> | undefined
    const ad = adGroupAd?.ad as Record<string, unknown> | undefined
    const metrics = (row.metrics ?? row.Metrics) as Record<string, unknown> | undefined

    const spend = metricsNum(metrics, "costMicros", "cost_micros") / 1_000_000
    const impressions = metricsNum(metrics, "impressions", "impressions")
    const clicks = metricsNum(metrics, "clicks", "clicks")
    const purchases = metricsNum(metrics, "conversions", "conversions")
    const revenue = metricsNum(metrics, "conversionsValue", "conversions_value")
    const ctrRaw = metricsNum(metrics, "ctr", "ctr")

    return {
      campaign_id: String(campaign?.id ?? ""),
      campaign_name: String(campaign?.name ?? ""),
      adgroup_id: String(adGroup?.id ?? ""),
      adgroup_name: String(adGroup?.name ?? ""),
      ad_id: String(ad?.id ?? ""),
      ad_name: String(ad?.name ?? ""),
      spend,
      impressions,
      clicks,
      purchases,
      revenue,
      ctr: ctrRaw > 1 ? ctrRaw / 100 : impressions > 0 ? clicks / impressions : ctrRaw,
      cpa: purchases > 0 ? spend / purchases : 0,
    }
  })
}

export async function pauseAdGroup(adGroupId: string): Promise<boolean> {
  const token = await getGoogleAccessToken()
  const cid = customerIdRaw()
  const res = await fetch(`${baseUrl()}/adGroups:mutate`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${cid}/adGroups/${adGroupId}`,
            status: "PAUSED",
          },
          updateMask: "status",
        },
      ],
    }),
  })
  return res.ok
}

export async function resumeAdGroup(adGroupId: string): Promise<boolean> {
  const token = await getGoogleAccessToken()
  const cid = customerIdRaw()
  const res = await fetch(`${baseUrl()}/adGroups:mutate`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${cid}/adGroups/${adGroupId}`,
            status: "ENABLED",
          },
          updateMask: "status",
        },
      ],
    }),
  })
  return res.ok
}

export async function pauseGoogleAd(adGroupId: string, adId: string): Promise<boolean> {
  const token = await getGoogleAccessToken()
  const cid = customerIdRaw()
  const res = await fetch(`${baseUrl()}/adGroupAds:mutate`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${cid}/adGroupAds/${adGroupId}~${adId}`,
            status: "PAUSED",
          },
          updateMask: "status",
        },
      ],
    }),
  })
  return res.ok
}

export async function resumeGoogleAd(adGroupId: string, adId: string): Promise<boolean> {
  const token = await getGoogleAccessToken()
  const cid = customerIdRaw()
  const res = await fetch(`${baseUrl()}/adGroupAds:mutate`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${cid}/adGroupAds/${adGroupId}~${adId}`,
            status: "ENABLED",
          },
          updateMask: "status",
        },
      ],
    }),
  })
  return res.ok
}

export async function scaleGoogleBudget(campaignId: string, newBudgetMicros: number): Promise<boolean> {
  const token = await getGoogleAccessToken()
  const cid = customerIdRaw()
  const q = `SELECT campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId}`
  const qRes = await fetch(`${baseUrl()}/googleAds:search`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({ query: q }),
  })
  const { results = [] } = (await qRes.json()) as {
    results: Array<{
      campaignBudget?: { resourceName?: string; resource_name?: string }
      campaign_budget?: { resource_name?: string }
    }>
  }
  const first = results[0]
  const budgetRn =
    first?.campaignBudget?.resourceName ??
    first?.campaignBudget?.resource_name ??
    first?.campaign_budget?.resource_name
  if (!budgetRn) return false

  const res = await fetch(`${baseUrl()}/campaignBudgets:mutate`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: budgetRn,
            amountMicros: String(newBudgetMicros),
          },
          updateMask: "amountMicros",
        },
      ],
    }),
  })
  return res.ok
}

export async function fetchCampaignBudgetMicros(campaignId: string): Promise<number | null> {
  const token = await getGoogleAccessToken()
  const q = `SELECT campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId}`
  const qRes = await fetch(`${baseUrl()}/googleAds:search`, {
    method: "POST",
    headers: gadsHeaders(token),
    body: JSON.stringify({ query: q }),
  })
  if (!qRes.ok) return null
  const { results = [] } = (await qRes.json()) as {
    results: Array<{
      campaignBudget?: { amountMicros?: string; amount_micros?: string }
      campaign_budget?: { amount_micros?: string }
    }>
  }
  const row = results[0]
  const micros =
    row?.campaignBudget?.amountMicros ??
    row?.campaignBudget?.amount_micros ??
    row?.campaign_budget?.amount_micros
  if (micros === undefined || micros === null) return null
  return Number(micros)
}
