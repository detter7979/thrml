import type { ClassificationResult, RecommendedAction } from "./classifier"

export type DecisionLike = {
  dispute_category: string | null
  confidence: string | null
  classification_reasoning: string | null
  recommended_action: string | null
  refund_amount: number | string | null
  refund_pct: number | string | null
  host_penalty_pct: number | string | null
  claude_raw_response: string | null
}

const ACTIONS: RecommendedAction[] = [
  "full_refund",
  "partial_refund",
  "no_refund",
  "host_penalty",
  "flag_for_human",
  "send_info",
  "no_action",
]

function suggestedReplyFromRaw(raw: string | null, fallback: string) {
  if (!raw) return fallback
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim()
    const p = JSON.parse(cleaned) as { suggested_reply?: string }
    if (typeof p.suggested_reply === "string" && p.suggested_reply.trim()) return p.suggested_reply
  } catch {
    /* ignore */
  }
  return fallback
}

export function classificationFromDecisionRow(
  row: DecisionLike,
  ticket: { name: string }
): ClassificationResult {
  const fallbackReply = `Hi ${ticket.name}, thank you for your patience. We've completed our review of your ticket and applied the resolution below.`
  const suggested_reply = suggestedReplyFromRaw(row.claude_raw_response, fallbackReply)

  const action = ACTIONS.includes(row.recommended_action as RecommendedAction)
    ? (row.recommended_action as RecommendedAction)
    : "flag_for_human"

  return {
    dispute_category: (row.dispute_category ?? "unclear") as ClassificationResult["dispute_category"],
    confidence: (row.confidence ?? "low") as ClassificationResult["confidence"],
    classification_reasoning: row.classification_reasoning ?? "",
    recommended_action: action,
    refund_pct: Number(row.refund_pct ?? 0),
    refund_amount: Number(row.refund_amount ?? 0),
    host_penalty_pct: Number(row.host_penalty_pct ?? 0),
    requires_human_review: false,
    human_review_reason: null,
    suggested_reply,
    raw_response: row.claude_raw_response ?? "",
  }
}

export function applyOverrideToClassification(
  base: ClassificationResult,
  override: {
    recommended_action: RecommendedAction
    refund_pct?: number
    refund_amount?: number
  },
  totalCharged: number
): ClassificationResult {
  const refund_pct =
    override.refund_pct !== undefined ? override.refund_pct : base.refund_pct
  let refund_amount =
    override.refund_amount !== undefined
      ? override.refund_amount
      : Math.round((totalCharged * refund_pct) / 100 * 100) / 100

  if (override.recommended_action === "full_refund") {
    refund_amount = totalCharged
  }
  if (override.recommended_action === "no_refund" || override.recommended_action === "no_action") {
    refund_amount = 0
  }

  return {
    ...base,
    recommended_action: override.recommended_action,
    refund_pct:
      override.recommended_action === "full_refund"
        ? 100
        : override.recommended_action === "no_refund" || override.recommended_action === "no_action"
          ? 0
          : refund_pct,
    refund_amount,
  }
}
