import type { Campaign } from "@/types/paid-media"

import type { EvaluatorContext, PerformanceMasterRow } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

function sumCampaignWindow(
  rows: PerformanceMasterRow[],
  campaignId: string,
  days: number,
  filter: (r: PerformanceMasterRow) => boolean
): { spend: number; conv: number; dates: Set<string> } {
  const from = isoDateUtcDaysAgo(days)
  let spend = 0
  let conv = 0
  const dates = new Set<string>()
  for (const r of rows) {
    if (r.campaign_id !== campaignId || r.level !== "campaign" || r.date < from) continue
    if (!filter(r)) continue
    spend += Number(r.spend_usd) || 0
    conv += Number(r.conversions) || 0
    dates.add(r.date)
  }
  return { spend, conv, dates }
}

export function hostGuestCac(
  rows: PerformanceMasterRow[],
  c: Campaign,
  days: number
): { cac: number | null; spend: number; conv: number; dates: Set<string> } {
  if (c.persona === "host") {
    const { spend, conv, dates } = sumCampaignWindow(rows, c.id, days, (r) => r.conv_event === "BH")
    const cac = conv > 0 && spend > 0 ? spend / conv : null
    return { cac, spend, conv, dates }
  }
  const ic = sumCampaignWindow(rows, c.id, days, (r) => r.conv_event === "IC")
  const pur = sumCampaignWindow(rows, c.id, days, (r) => r.conv_event === "PUR")
  const spend = ic.spend + pur.spend
  const conv = ic.conv + pur.conv
  const dates = new Set([...ic.dates, ...pur.dates])
  const cac = conv > 0 && spend > 0 ? spend / conv : null
  return { cac, spend, conv, dates }
}

export function targetCacUsd(ctx: EvaluatorContext, c: Campaign): number {
  if (c.persona === "host") {
    const signup = ruleNumber(ctx.rules, "host.*", "target_cac_signup_usd", NaN)
    if (Number.isFinite(signup) && signup > 0) return signup
    return ruleNumber(ctx.rules, "host.*", "target_cac_activation_usd", 150)
  }
  return ruleNumber(ctx.rules, "guest.*", "target_cac_purchase_usd", 35)
}
