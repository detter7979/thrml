import { getMetaAdAccountId, getMetaInstagramUserId, getMetaPageId } from "@/lib/agent/meta-api"

function graphBase() {
  const v = (process.env.META_API_VERSION ?? "v21.0").replace(/^v/, "v")
  return `https://graph.facebook.com/${v}`
}

type GraphIgAccount = { id?: string; username?: string }

type GraphFetchResult = {
  ok: boolean
  json: Record<string, unknown> | null
  permissionDenied: boolean
  errorMessage: string | null
}

async function fetchGraph(url: string): Promise<GraphFetchResult> {
  const res = await fetch(url)
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (res.ok) {
    return { ok: true, json, permissionDenied: false, errorMessage: null }
  }

  const err =
    json?.error && typeof json.error === "object"
      ? (json.error as { message?: string; code?: number })
      : null
  const message = typeof err?.message === "string" ? err.message : `HTTP ${res.status}`
  const permissionDenied =
    err?.code === 100 &&
    (message.includes("pages_read_engagement") ||
      message.includes("permission") ||
      message.includes("does not exist"))

  return { ok: false, json, permissionDenied, errorMessage: message }
}

function preferredInstagramUsername() {
  return process.env.META_INSTAGRAM_USERNAME?.trim().toLowerCase() || "usethrml"
}

function pickInstagramAccount(
  accounts: GraphIgAccount[],
  preferredUsername: string
): GraphIgAccount | null {
  if (!accounts.length) return null
  const byUsername = accounts.find(
    (row) => typeof row.username === "string" && row.username.toLowerCase() === preferredUsername
  )
  if (byUsername?.id) return byUsername
  return accounts[0] ?? null
}

/** Instagram accounts connected to the ad account (works with ads_management token). */
export async function fetchAdAccountInstagramAccounts(
  adAccountId: string,
  token: string
): Promise<{ accounts: GraphIgAccount[]; permissionDenied: boolean; errorMessage: string | null }> {
  const base = graphBase()
  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId.replace(/^act_/, "")}`
  const url = new URL(`${base}/${actId}/instagram_accounts`)
  url.searchParams.set("fields", "id,username")
  url.searchParams.set("access_token", token)

  const result = await fetchGraph(url.toString())
  if (!result.ok) {
    return {
      accounts: [],
      permissionDenied: result.permissionDenied,
      errorMessage: result.errorMessage,
    }
  }

  const data = result.json?.data
  const accounts = Array.isArray(data) ? (data as GraphIgAccount[]) : []
  return { accounts, permissionDenied: false, errorMessage: null }
}

/** Instagram Business Account id linked to the Facebook Page. */
export async function fetchPageInstagramBusinessAccountId(
  pageId: string,
  token: string
): Promise<{ id: string | null; permissionDenied: boolean; errorMessage: string | null }> {
  const base = graphBase()

  const pageUrl = new URL(`${base}/${pageId}`)
  pageUrl.searchParams.set("fields", "instagram_business_account")
  pageUrl.searchParams.set("access_token", token)
  const pageResult = await fetchGraph(pageUrl.toString())
  if (pageResult.ok) {
    const fromPage = pageResult.json?.instagram_business_account as GraphIgAccount | undefined
    if (typeof fromPage?.id === "string" && fromPage.id.trim()) {
      return { id: fromPage.id.trim(), permissionDenied: false, errorMessage: null }
    }
  }

  const accountsUrl = new URL(`${base}/${pageId}/instagram_accounts`)
  accountsUrl.searchParams.set("fields", "id,username")
  accountsUrl.searchParams.set("access_token", token)
  const accountsResult = await fetchGraph(accountsUrl.toString())
  if (accountsResult.ok) {
    const data = accountsResult.json?.data
    if (Array.isArray(data) && data.length > 0) {
      const picked = pickInstagramAccount(data as GraphIgAccount[], preferredInstagramUsername())
      if (picked?.id) return { id: picked.id.trim(), permissionDenied: false, errorMessage: null }
    }
  }

  const backedUrl = new URL(`${base}/${pageId}/page_backed_instagram_accounts`)
  backedUrl.searchParams.set("fields", "id,username")
  backedUrl.searchParams.set("access_token", token)
  const backedResult = await fetchGraph(backedUrl.toString())
  if (backedResult.ok) {
    const data = backedResult.json?.data
    if (Array.isArray(data) && data.length > 0) {
      const picked = pickInstagramAccount(data as GraphIgAccount[], preferredInstagramUsername())
      if (picked?.id) return { id: picked.id.trim(), permissionDenied: false, errorMessage: null }
    }
  }

  const permissionDenied = pageResult.permissionDenied || accountsResult.permissionDenied
  const errorMessage = pageResult.errorMessage ?? accountsResult.errorMessage
  return { id: null, permissionDenied, errorMessage }
}

export type ResolvedInstagramActor = {
  id: string | null
  source: "ad_account" | "page" | "env" | "none"
  username: string | null
  pageLinkedId: string | null
  adAccountLinkedId: string | null
  envId: string | null
  pageLookupFailed: boolean
  pagePermissionDenied: boolean
  diagnostics: string[]
}

/**
 * Resolve Instagram actor id for ad creatives with IG placements.
 * Uses ad-account instagram_accounts first (ads_management), then Page lookup.
 */
export async function resolveMetaInstagramActorId(opts?: {
  pageId?: string
  adAccountId?: string
  token?: string
}): Promise<ResolvedInstagramActor> {
  const envId = getMetaInstagramUserId()
  const pageId = opts?.pageId?.trim() || getMetaPageId()
  const adAccountId = opts?.adAccountId?.trim() || getMetaAdAccountId()
  const token = opts?.token?.trim()
  const preferredUsername = preferredInstagramUsername()
  const diagnostics: string[] = []

  if (!token) {
    return {
      id: envId,
      source: envId ? "env" : "none",
      username: preferredUsername,
      pageLinkedId: null,
      adAccountLinkedId: null,
      envId,
      pageLookupFailed: false,
      pagePermissionDenied: false,
      diagnostics,
    }
  }

  let adAccountLinkedId: string | null = null
  let adAccountUsername: string | null = null

  const adIg = await fetchAdAccountInstagramAccounts(adAccountId, token)
  if (adIg.accounts.length) {
    const picked = pickInstagramAccount(adIg.accounts, preferredUsername)
    if (picked?.id) {
      adAccountLinkedId = picked.id.trim()
      adAccountUsername =
        typeof picked.username === "string" ? picked.username : preferredUsername
      diagnostics.push(
        `Ad account lists Instagram @${adAccountUsername} (id ${adAccountLinkedId}).`
      )
    }
  } else if (adIg.errorMessage) {
    diagnostics.push(`Ad account instagram_accounts: ${adIg.errorMessage}`)
  }

  const pageLookup = await fetchPageInstagramBusinessAccountId(pageId, token)
  const pageLinkedId = pageLookup.id
  if (pageLinkedId) {
    diagnostics.push(`Page ${pageId} instagram_business_account: ${pageLinkedId}.`)
  } else if (pageLookup.permissionDenied) {
    diagnostics.push(
      `Page lookup needs pages_read_engagement on META_MARKETING_API_TOKEN (Graph error: ${pageLookup.errorMessage ?? "permission denied"}).`
    )
  } else if (pageLookup.errorMessage) {
    diagnostics.push(`Page lookup failed: ${pageLookup.errorMessage}`)
  }

  if (pageLinkedId && adAccountLinkedId && pageLinkedId !== adAccountLinkedId) {
    console.warn("[meta-instagram] Page IG id differs from ad account IG id; using ad account", {
      pageLinkedId,
      adAccountLinkedId,
      pageId,
    })
    diagnostics.push(
      "Page and ad account Instagram ids differ — using ad account id for launch."
    )
  }

  if (adAccountLinkedId) {
    if (envId && envId !== adAccountLinkedId) {
      diagnostics.push(
        `Ignoring META_INSTAGRAM_ACCOUNT_ID (${envId}); using ad account id ${adAccountLinkedId}.`
      )
    }
    return {
      id: adAccountLinkedId,
      source: "ad_account",
      username: adAccountUsername,
      pageLinkedId,
      adAccountLinkedId,
      envId,
      pageLookupFailed: !pageLinkedId,
      pagePermissionDenied: pageLookup.permissionDenied,
      diagnostics,
    }
  }

  if (pageLinkedId) {
    if (envId && envId !== pageLinkedId) {
      diagnostics.push(`Ignoring META_INSTAGRAM_ACCOUNT_ID; using Page id ${pageLinkedId}.`)
    }
    return {
      id: pageLinkedId,
      source: "page",
      username: preferredUsername,
      pageLinkedId,
      adAccountLinkedId: null,
      envId,
      pageLookupFailed: false,
      pagePermissionDenied: false,
      diagnostics,
    }
  }

  if (envId) {
    diagnostics.push(
      "Could not verify Instagram via API; using META_INSTAGRAM_ACCOUNT_ID from env. " +
        "If launch fails, fix token permissions or set the id from act_<id>/instagram_accounts."
    )
    return {
      id: envId,
      source: "env",
      username: preferredUsername,
      pageLinkedId: null,
      adAccountLinkedId: null,
      envId,
      pageLookupFailed: true,
      pagePermissionDenied: pageLookup.permissionDenied,
      diagnostics,
    }
  }

  return {
    id: null,
    source: "none",
    username: null,
    pageLinkedId: null,
    adAccountLinkedId: null,
    envId: null,
    pageLookupFailed: true,
    pagePermissionDenied: pageLookup.permissionDenied,
    diagnostics,
  }
}

export function metaInstagramAccountMissingHint(pageId?: string): string {
  const pid = pageId?.trim() || getMetaPageId()
  return (
    "Meta needs the Instagram Business Account id connected to your ad account and Page. " +
    `Page ${pid} shows @usethrml in Business Settings, but the API token must resolve it: ` +
    "add pages_read_engagement to your system user and regenerate META_MARKETING_API_TOKEN, " +
    "or set META_INSTAGRAM_ACCOUNT_ID to the id from GET act_<ad_account_id>/instagram_accounts " +
    "(Graph API Explorer → Page token or system user with ads_management). " +
    "Remove META_INSTAGRAM_ACCOUNT_ID to retry Facebook-only placements."
  )
}

export function isMetaInstagramAccountMissingError(payload: unknown): boolean {
  const err =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: number; error_subcode?: number } }).error
      : null
  return err?.code === 100 && err?.error_subcode === 1772103
}
