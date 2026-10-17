import type { Campaign } from "@/types/paid-media"

import type { EvaluatorContext, PerformanceMasterRow } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

/**
 * Cost per result for a campaign, where "result" is the campaign's own optimization event
 * (BH, HO, NL, VC, IC, PUR…). Spend counts every row: the ingest stores spend on only one of a
 * day's event rows, so filtering spend by event would under- (or zero-) count it.
 */
function sumCampaignWindow(
  rows: PerformanceMasterRow[],
  campaignId: string,
  days: number,
  isResult: (r: PerformanceMasterRow) => boolean
): { spend: number; conv: number; dates: Set<string> } {
  const from = isoDateUtcDaysAgo(days)
  let spend = 0
  let conv = 0
  const dates = new Set<string>()
  for (const r of rows) {
    if (r.campaign_id !== campaignId || r.level !== "campaign" || r.date < from) continue
    spend += Number(r.spend_usd) || 0
    if (isResult(r)) conv += Number(r.conversions) || 0
    dates.add(r.date)
  }
  return { spend, conv, dates }
}

/** The event a campaign is judged on. Falls back to the old persona defaults if the event is unset. */
export function resultEvent(c: Campaign): string {
  if (c.event) return c.event
  return c.persona === "host" ? "BH" : "PUR"
}

export function hostGuestCac(
  rows: PerformanceMasterRow[],
  c: Campaign,
  days: number
): { cac: number | null; spend: number; conv: number; dates: Set<string> } {
  const ev = resultEvent(c)
  const { spend, conv, dates } = sumCampaignWindow(rows, c.id, days, (r) => r.conv_event === ev)
  const cac = conv > 0 && spend > 0 ? spend / conv : null
  return { cac, spend, conv, dates }
}

/** rules_config key + default per optimization event. Edit the values on the admin Rules tab. */
export const TARGET_COST_KEYS: Record<string, { scope: string; key: string; fallback: number }> = {
  BH: { scope: "host.*", key: "target_cac_signup_usd", fallback: 5 },
  HO: { scope: "host.*", key: "target_cost_ho_usd", fallback: 40 },
  NL: { scope: "host.*", key: "target_cost_nl_usd", fallback: 150 },
  ACT: { scope: "host.*", key: "target_cac_activation_usd", fallback: 150 },
  VC: { scope: "guest.*", key: "target_cost_vc_usd", fallback: 1.5 },
  IC: { scope: "guest.*", key: "target_cost_ic_usd", fallback: 15 },
  PUR: { scope: "guest.*", key: "target_cac_purchase_usd", fallback: 35 },
  LEAD: { scope: "guest.*", key: "target_cost_lead_usd", fallback: 5 },
}

export function targetCacUsd(ctx: EvaluatorContext, c: Campaign): number {
  const t = TARGET_COST_KEYS[resultEvent(c)] ?? TARGET_COST_KEYS[c.persona === "host" ? "BH" : "PUR"]!
  return ruleNumber(ctx.rules, t.scope, t.key, t.fallback)
}
