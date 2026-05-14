import type { Recommendation } from "@/types/paid-media"
import type { MetaExecutionKind } from "./types"

/** Maps evaluator recommendation kinds to meta_executions.kind. Null = not executed on Meta in Phase A. */
export function mapRecKindToExecutionKind(rec: Recommendation): MetaExecutionKind | null {
  switch (rec.kind) {
    case "PAUSE_CAMPAIGN":
      return "pause_campaign"
    case "PAUSE_AD_SET":
      return "pause_ad_set"
    case "PAUSE_AD":
      return "pause_ad"
    case "KILL_CAMPAIGN":
      return "kill_campaign"
    case "KILL_AD_SET":
      return "kill_ad_set"
    case "KILL_AD":
      return "kill_ad"
    case "ADJUST_BUDGET":
      if (rec.target_ad_set_id) return "adjust_ad_set_budget"
      if (rec.target_campaign_id) return "adjust_campaign_budget"
      return null
    default:
      return null
  }
}
