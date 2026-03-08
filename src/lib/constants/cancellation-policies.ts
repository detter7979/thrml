export type CancellationPolicy = "flexible" | "moderate" | "strict"

export const CANCELLATION_POLICIES: Record<
  CancellationPolicy,
  {
    label: string
    tagline: string
    description: string
    refundWindow: string
    bulletPoints: string[]
    color: string
  }
> = {
  flexible: {
    label: "Flexible",
    tagline: "Free cancellation up to 24 hours before your session.",
    description:
      "Cancel up to 24 hours before your session for a full refund. Cancellations within 24 hours of the session start time receive a 50% refund. No refund for no-shows.",
    refundWindow: "up to 24 hours before",
    bulletPoints: [
      "Full refund if cancelled 24+ hours before session",
      "50% refund if cancelled within 24 hours",
      "No refund for no-shows",
      "Service fee is non-refundable",
    ],
    color: "#2D7A47",
  },
  moderate: {
    label: "Moderate",
    tagline: "Free cancellation up to 48 hours before your session.",
    description:
      "Cancel up to 48 hours before your session for a full refund. Cancellations within 48 hours of the session start time receive a 50% refund. No refund for no-shows.",
    refundWindow: "up to 48 hours before",
    bulletPoints: [
      "Full refund if cancelled 48+ hours before session",
      "50% refund if cancelled within 48 hours",
      "No refund for no-shows",
      "Service fee is non-refundable",
    ],
    color: "#B87D2A",
  },
  strict: {
    label: "Strict",
    tagline: "Free cancellation up to 72 hours before your session.",
    description:
      "Cancel up to 72 hours before your session for a full refund. No refund for cancellations within 72 hours of the session start time. No refund for no-shows.",
    refundWindow: "up to 72 hours before",
    bulletPoints: [
      "Full refund if cancelled 72+ hours before session",
      "No refund within 72 hours of session",
      "No refund for no-shows",
      "Service fee is non-refundable",
    ],
    color: "#C0392B",
  },
}

export function getCancellationPolicy(policy: string | null | undefined) {
  const normalized = typeof policy === "string" ? policy.trim().toLowerCase() : ""
  if (normalized === "flexible" || normalized === "moderate" || normalized === "strict") {
    return CANCELLATION_POLICIES[normalized]
  }
  return CANCELLATION_POLICIES.flexible
}
