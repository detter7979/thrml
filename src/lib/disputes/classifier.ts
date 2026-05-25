import Anthropic from "@anthropic-ai/sdk"

export type DisputeCategory =
  | "access_failure"
  | "space_not_as_described"
  | "guest_no_show"
  | "host_no_show"
  | "early_termination"
  | "billing_error"
  | "general_help"
  | "safety_injury"
  | "unclear"

export type RecommendedAction =
  | "full_refund"
  | "partial_refund"
  | "no_refund"
  | "host_penalty"
  | "flag_for_human"
  | "send_info"
  | "no_action"

export type ClassificationResult = {
  dispute_category: DisputeCategory
  confidence: "high" | "medium" | "low"
  classification_reasoning: string
  recommended_action: RecommendedAction
  refund_pct: number
  refund_amount: number
  host_penalty_pct: number
  requires_human_review: boolean
  human_review_reason: string | null
  suggested_reply: string
  raw_response: string
}

export type BookingContext = {
  booking_id: string | null
  guest_id: string | null
  booking_status: string | null
  total_charged: number
  session_date: string | null
  start_time: string | null
  hours_until_session: number | null
  cancellation_policy: string | null
  guest_dispute_count: number
  host_dispute_count: number
  host_cancellation_count: number
  has_safety_mention: boolean
}

function applySafetyOverride(
  booking: BookingContext,
  parsed: Omit<ClassificationResult, "refund_amount" | "raw_response">,
  guestName: string
): Omit<ClassificationResult, "refund_amount" | "raw_response"> {
  if (!booking.has_safety_mention) return parsed

  const firstName = guestName.trim().split(/\s+/)[0] || "there"

  return {
    ...parsed,
    dispute_category: "safety_injury",
    confidence: "high",
    classification_reasoning:
      "Safety-related language detected. Safety Override applied: automatic full refund with optional guest incident documentation — not gated on form completion.",
    recommended_action: "full_refund",
    refund_pct: 100,
    host_penalty_pct: parsed.host_penalty_pct ?? 0,
    requires_human_review: false,
    human_review_reason: null,
    suggested_reply: `Hi ${firstName}, we're truly sorry to hear about your experience. Your wellbeing matters to us. We've processed a full refund for your booking, which should appear on your statement within 5–10 business days. We've also sent a separate note with an optional link to share more detail if and when you're ready — there's no rush, and it's completely optional.`,
  }
}

export async function classifyDispute(
  ticket: {
    subject: string
    message: string
    name: string
    email: string
    ticket_number: string
  },
  booking: BookingContext,
  policyText: string
): Promise<ClassificationResult> {
  const client = new Anthropic()

  const systemPrompt = `You are a dispute resolution agent for thrml, a peer-to-peer wellness space marketplace.
You evaluate guest and host disputes and recommend resolutions strictly based on the provided policy.
You ALWAYS respond with valid JSON only — no preamble, no markdown, no explanation outside the JSON object.

POLICY DOCUMENT:
${policyText}

ESCALATION RULES (override any other recommendation):
- If has_safety_mention is true → Safety Override: dispute_category MUST be safety_injury, recommended_action MUST be full_refund, refund_pct MUST be 100, requires_human_review MUST be false, confidence MUST be high. Human follow-up happens via the incident workflow; do NOT block the refund on guest form completion.
- If total_charged > 200 → requires_human_review must be true, confidence must be 'medium' or 'low' (unless Safety Override applies)
- If guest_dispute_count >= 2 → requires_human_review must be true, note in reasoning
- If host_dispute_count >= 3 → add host_penalty, requires_human_review must be true
- If message contains any variation of "lawyer", "legal", "sue", "court" → requires_human_review must be true`

  const userPrompt = `Evaluate this support ticket and booking context. Return JSON only.

TICKET:
Subject: ${ticket.subject}
Message: ${ticket.message}
Guest name: ${ticket.name}

BOOKING CONTEXT:
${JSON.stringify(booking, null, 2)}

Return this exact JSON shape (no other text):
{
  "dispute_category": "<one of the DisputeCategory values>",
  "confidence": "<high|medium|low>",
  "classification_reasoning": "<2-3 sentences explaining your classification>",
  "recommended_action": "<one of the RecommendedAction values>",
  "refund_pct": <0-100>,
  "host_penalty_pct": <0-100>,
  "requires_human_review": <true|false>,
  "human_review_reason": "<reason string or null>",
  "suggested_reply": "<polite, professional 2-3 paragraph reply to send to the user explaining what will happen>"
}`

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")

  const cleaned = rawText.replace(/```json|```/g, "").trim()

  let parsed: Omit<ClassificationResult, "refund_amount" | "raw_response">
  try {
    parsed = JSON.parse(cleaned) as Omit<ClassificationResult, "refund_amount" | "raw_response">
  } catch {
    const fallback = applySafetyOverride(
      booking,
      {
        dispute_category: "unclear",
        confidence: "low",
        classification_reasoning: "Agent failed to parse — flagged for human review.",
        recommended_action: "flag_for_human",
        refund_pct: 0,
        host_penalty_pct: 0,
        requires_human_review: true,
        human_review_reason: "Claude response was not valid JSON.",
        suggested_reply: `Hi ${ticket.name}, thank you for reaching out. We're reviewing your request and will follow up shortly.`,
      },
      ticket.name
    )

    const refund_amount =
      Math.round((booking.total_charged * (fallback.refund_pct ?? 0)) / 100 * 100) / 100

    return {
      ...fallback,
      refund_amount,
      raw_response: rawText,
    }
  }

  const overridden = applySafetyOverride(booking, parsed, ticket.name)

  const refund_amount =
    Math.round((booking.total_charged * (overridden.refund_pct ?? 0)) / 100 * 100) / 100

  return {
    ...overridden,
    refund_pct: overridden.refund_pct ?? 0,
    host_penalty_pct: overridden.host_penalty_pct ?? 0,
    refund_amount,
    requires_human_review: overridden.requires_human_review ?? false,
    human_review_reason: overridden.human_review_reason ?? null,
    raw_response: rawText,
  }
}
