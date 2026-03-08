export const SUPPORT_SUBJECTS = [
  "Access & Entry",
  "Booking & Cancellation",
  "Payment & Refunds",
  "Reviews & Ratings",
  "Listing Issue",
  "Technical Problem",
  "Safety Concern",
  "Host Payouts",
  "Account & Profile",
  "Other",
] as const

export type SupportSubject = (typeof SUPPORT_SUBJECTS)[number]
export type SupportPriority = "urgent" | "high" | "normal"

export const SUPPORT_TOPIC_OPTIONS: Array<{ value: SupportSubject; label: string }> = [
  { value: "Access & Entry", label: "🔐 Access & Entry" },
  { value: "Booking & Cancellation", label: "📅 Booking & Cancellation" },
  { value: "Payment & Refunds", label: "💳 Payment & Refunds" },
  { value: "Reviews & Ratings", label: "⭐ Reviews & Ratings" },
  { value: "Listing Issue", label: "🏠 Listing Issue" },
  { value: "Technical Problem", label: "🔧 Technical Problem" },
  { value: "Safety Concern", label: "🛡️ Safety Concern" },
  { value: "Host Payouts", label: "💼 Host Payouts" },
  { value: "Account & Profile", label: "🏷️ Account & Profile" },
  { value: "Other", label: "💬 Other" },
]

export function deriveSupportPriority(subject: string): SupportPriority {
  if (subject === "Safety Concern") return "urgent"
  if (subject === "Payment & Refunds" || subject === "Access & Entry") return "high"
  return "normal"
}

export function supportResponseTime(priority: SupportPriority) {
  return priority === "normal" ? "within 1-3 business days" : "within 24 hours"
}
