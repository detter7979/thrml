import type { Recommendation } from "@/types/paid-media"

import type { RuleResult } from "./types"

function targetKeyForRec(r: Recommendation): string {
  return [r.target_campaign_id ?? "", r.target_ad_set_id ?? "", r.target_ad_id ?? ""].join("|")
}

function targetKeyForProposal(p: RuleResult): string {
  const t = p.target
  return [t.campaignId ?? "", t.adSetId ?? "", t.adId ?? ""].join("|")
}

const SKIP_STATUSES = new Set<string>(["EXPIRED", "REJECTED"])

export function dedupeProposals(proposals: RuleResult[], recentRecs: Recommendation[]): RuleResult[] {
  const seen = new Set<string>()
  for (const r of recentRecs) {
    if (SKIP_STATUSES.has(r.status)) continue
    seen.add(`${r.kind}::${targetKeyForRec(r)}`)
  }
  return proposals.filter((p) => {
    const k = `${p.kind}::${targetKeyForProposal(p)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
