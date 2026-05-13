import Stripe from "stripe"

import { stripe } from "@/lib/stripe"

export type ProfileVerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "requires_input"
  | "canceled"
  | "failed"

export async function createVerificationSession(
  userId: string,
  returnUrl: string
): Promise<{ url: string; sessionId: string }> {
  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { profile_id: userId },
    return_url: returnUrl,
    options: {
      document: {
        allowed_types: ["driving_license", "passport", "id_card"],
        require_matching_selfie: true,
      },
    },
  })
  const url = session.url
  if (!url) {
    throw new Error("Stripe Identity session did not return a hosted URL")
  }
  return { url, sessionId: session.id }
}

export async function retrieveVerificationSession(
  sessionId: string
): Promise<Stripe.Identity.VerificationSession> {
  return stripe.identity.verificationSessions.retrieve(sessionId)
}

export function mapStripeStatusToProfileStatus(
  stripeStatus: string,
  lastError?: { code?: string } | null
): ProfileVerificationStatus {
  switch (stripeStatus) {
    case "requires_input":
      return "requires_input"
    case "processing":
      return "pending"
    case "verified":
      return "verified"
    case "canceled":
      return "canceled"
    case "created":
      return "not_started"
    default:
      if (lastError) return "failed"
      return "pending"
  }
}
