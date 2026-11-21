/** Report targets and reasons, shared by the report dialog and /api/reports (client-safe). */

export const REPORT_TARGET_TYPES = ["listing", "review", "message", "user"] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

export const REPORT_REASONS = [
  { value: "inappropriate", label: "Inappropriate or offensive" },
  { value: "harassment", label: "Harassment or threats" },
  { value: "safety", label: "Safety concern" },
  { value: "misleading", label: "Misleading or fake" },
  { value: "discrimination", label: "Discrimination" },
  { value: "spam", label: "Spam or scam" },
  { value: "other", label: "Something else" },
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]["value"]

export const REPORT_TARGET_LABEL: Record<ReportTargetType, string> = {
  listing: "listing",
  review: "review",
  message: "message",
  user: "person",
}
