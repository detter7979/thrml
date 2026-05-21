/**
 * Meta Marketing API reads for namer-sync only (one-way Meta → Sheet).
 * Uses token/account helpers from meta-ads-api; does not modify that module.
 */

import {
  getMetaAccessToken,
  getMetaAdAccountId,
  isUnavailableObjectError,
  parseMetaGraphErrorFromText,
} from "@/lib/agent/meta-ads-api"

function graphBase(): string {
  const v = (process.env.META_API_VERSION ?? "v21.0").replace(/^v/, "v")
  return `https://graph.facebook.com/${v}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Mirrors meta-ads-api fetchWithRetry (not exported there). */
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
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

export type MetaNamerObject = {
  id: string
  name?: string
  status?: string
  effective_status?: string
  daily_budget?: string
  campaign_id?: string
  adset_id?: string
}

export type MetaObjectFetchResult =
  | { ok: true; data: MetaNamerObject }
  | { ok: false; unavailable: true; error?: string }
  | { ok: false; unavailable: false; error: string }

async function fetchGraphJson(url: string): Promise<
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; unavailable: boolean; error: string }
> {
  const res = await fetchWithRetry(url)
  const text = await res.text()
  if (!res.ok) {
    const err = parseMetaGraphErrorFromText(text)
    if (isUnavailableObjectError(err)) {
      return { ok: false, unavailable: true, error: err?.message ?? text.slice(0, 200) }
    }
    return { ok: false, unavailable: false, error: `Meta HTTP ${res.status}: ${text.slice(0, 500)}` }
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, unavailable: false, error: "Invalid JSON from Meta" }
  }
  const err = (json as { error?: { code?: number; message?: string; error_subcode?: number } }).error
  if (err) {
    if (isUnavailableObjectError(err)) {
      return { ok: false, unavailable: true, error: err.message ?? "unavailable" }
    }
    return { ok: false, unavailable: false, error: err.message ?? "Meta API error" }
  }
  return { ok: true, json }
}

export async function fetchMetaCampaign(id: string): Promise<MetaObjectFetchResult> {
  const token = encodeURIComponent(getMetaAccessToken())
  const fields = encodeURIComponent("name,status,effective_status,daily_budget")
  const url = `${graphBase()}/${id}?fields=${fields}&access_token=${token}`
  const res = await fetchGraphJson(url)
  if (!res.ok) return res.unavailable ? { ok: false, unavailable: true, error: res.error } : res
  const j = res.json
  return {
    ok: true,
    data: {
      id,
      name: String(j.name ?? ""),
      status: String(j.status ?? ""),
      effective_status: String(j.effective_status ?? ""),
      daily_budget: j.daily_budget != null ? String(j.daily_budget) : undefined,
    },
  }
}

export async function fetchMetaAdSet(id: string): Promise<MetaObjectFetchResult> {
  const token = encodeURIComponent(getMetaAccessToken())
  const fields = encodeURIComponent("name,status,effective_status,daily_budget,campaign_id")
  const url = `${graphBase()}/${id}?fields=${fields}&access_token=${token}`
  const res = await fetchGraphJson(url)
  if (!res.ok) return res.unavailable ? { ok: false, unavailable: true, error: res.error } : res
  const j = res.json
  return {
    ok: true,
    data: {
      id,
      name: String(j.name ?? ""),
      status: String(j.status ?? ""),
      effective_status: String(j.effective_status ?? ""),
      daily_budget: j.daily_budget != null ? String(j.daily_budget) : undefined,
      campaign_id: j.campaign_id != null ? String(j.campaign_id) : undefined,
    },
  }
}

export async function fetchMetaAd(id: string): Promise<MetaObjectFetchResult> {
  const token = encodeURIComponent(getMetaAccessToken())
  const fields = encodeURIComponent("name,status,effective_status,adset_id,campaign_id")
  const url = `${graphBase()}/${id}?fields=${fields}&access_token=${token}`
  const res = await fetchGraphJson(url)
  if (!res.ok) return res.unavailable ? { ok: false, unavailable: true, error: res.error } : res
  const j = res.json
  return {
    ok: true,
    data: {
      id,
      name: String(j.name ?? ""),
      status: String(j.status ?? ""),
      effective_status: String(j.effective_status ?? ""),
      adset_id: j.adset_id != null ? String(j.adset_id) : undefined,
      campaign_id: j.campaign_id != null ? String(j.campaign_id) : undefined,
    },
  }
}

async function fetchAllPages<T>(buildUrl: (token: string) => string): Promise<T[]> {
  const token = encodeURIComponent(getMetaAccessToken())
  const rows: T[] = []
  let url: string | null = buildUrl(token)
  while (url) {
    const res = await fetchWithRetry(url)
    if (!res.ok) {
      const text = await res.text()
      const err = parseMetaGraphErrorFromText(text)
      if (isUnavailableObjectError(err)) break
      throw new Error(`Meta list error ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = (await res.json()) as { data?: T[]; paging?: { next?: string } }
    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }
  return rows
}

export async function listMetaCampaigns(): Promise<MetaNamerObject[]> {
  const acct = getMetaAdAccountId()
  const fields = encodeURIComponent("id,name,status,effective_status")
  return fetchAllPages<MetaNamerObject>((token) =>
    `${graphBase()}/${acct}/campaigns?fields=${fields}&limit=500&access_token=${token}`
  )
}

export async function listMetaAdSets(): Promise<MetaNamerObject[]> {
  const acct = getMetaAdAccountId()
  const fields = encodeURIComponent("id,name,status,effective_status,campaign_id")
  return fetchAllPages<MetaNamerObject>((token) =>
    `${graphBase()}/${acct}/adsets?fields=${fields}&limit=500&access_token=${token}`
  )
}

export async function listMetaAds(): Promise<MetaNamerObject[]> {
  const acct = getMetaAdAccountId()
  const fields = encodeURIComponent("id,name,status,effective_status,adset_id,campaign_id")
  return fetchAllPages<MetaNamerObject>((token) =>
    `${graphBase()}/${acct}/ads?fields=${fields}&limit=500&access_token=${token}`
  )
}
