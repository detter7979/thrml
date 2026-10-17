import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { googleAdsSearch } from "@/lib/agent/google-ads-api"
import { getGA4AccessToken } from "@/lib/analytics/ga4-auth"
import { envClean } from "@/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Obj = Record<string, unknown>

/** Admin: which GA4 key events exist, and which Google Ads conversion actions (incl. GA4 imports) are set up. */
export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error
  const out: Obj = {}

  try {
    const pid = envClean("GA4_PROPERTY_ID") ?? ""
    const property = pid.startsWith("properties/") ? pid : `properties/${pid}`
    const token = await getGA4AccessToken()
    const r = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${property}/keyEvents?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = (await r.json()) as { keyEvents?: { eventName: string; countingMethod?: string; defaultValue?: Obj }[]; error?: Obj }
    out.ga4KeyEvents = r.ok ? (j.keyEvents ?? []).map((k) => ({ event: k.eventName, counting: k.countingMethod, defaultValue: k.defaultValue })) : { error: j.error }
  } catch (e) {
    out.ga4KeyEvents = { error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const rows = await googleAdsSearch(`
      SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type,
             conversion_action.category, conversion_action.primary_for_goal, conversion_action.counting_type,
             conversion_action.include_in_conversions_metric
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'`)
    out.googleAdsConversionActions = rows.map((r) => {
      const c = (r.conversionAction ?? r.conversion_action ?? {}) as Obj
      return {
        name: c.name,
        status: c.status,
        type: c.type,
        category: c.category,
        primary: c.primaryForGoal ?? c.primary_for_goal,
        counting: c.countingType ?? c.counting_type,
      }
    })
  } catch (e) {
    out.googleAdsConversionActions = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json(out)
}
