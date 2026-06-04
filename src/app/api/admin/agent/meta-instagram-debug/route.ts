import { NextResponse } from "next/server"

import { getMetaAdAccountId, getMetaMarketingApiToken, getMetaPageId } from "@/lib/agent/meta-api"
import {
  fetchAdAccountInstagramAccounts,
  fetchPageInstagramBusinessAccountId,
  resolveMetaInstagramActorId,
} from "@/lib/agent/meta-instagram-account"
import { requireAdminApi } from "@/lib/admin-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  try {
    const token = getMetaMarketingApiToken()
    const pageId = getMetaPageId()
    const adAccountId = getMetaAdAccountId()

    const [adIg, pageIg, resolved] = await Promise.all([
      fetchAdAccountInstagramAccounts(adAccountId, token),
      fetchPageInstagramBusinessAccountId(pageId, token),
      resolveMetaInstagramActorId({ pageId, adAccountId, token }),
    ])

    return NextResponse.json({
      pageId,
      adAccountId,
      adAccountInstagramAccounts: adIg.accounts,
      pageInstagramBusinessAccountId: pageIg.id,
      pageLookupPermissionDenied: pageIg.permissionDenied,
      pageLookupError: pageIg.errorMessage,
      resolvedActorId: resolved.id,
      resolvedSource: resolved.source,
      resolvedUsername: resolved.username,
      diagnostics: resolved.diagnostics,
      hint:
        "Use resolvedActorId for launch. If page lookup fails but ad account lists an account, launch uses the ad account id.",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta Instagram debug failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
