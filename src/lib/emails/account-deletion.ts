import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"

export async function sendAccountDeletionRequestedEmail(args: {
  userId: string
  email: string
  firstName: string | null
  graceEndsAt: Date
}): Promise<{ sent: boolean; error?: string }> {
  const name = args.firstName ?? "there"
  const cancelUrl = `${THRML_APP_URL}/settings/delete-account`
  const graceLabel = args.graceEndsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return sendThrmlLayoutEmail({
    to: args.email,
    subject: "Your thrml account deletion request",
    userId: args.userId,
    layout: {
      preview: "Account deletion scheduled — 30-day grace period",
      kicker: "Account",
      title: `We received your deletion request, ${name}.`,
      paragraphs: [
        `Your account is scheduled for deletion on ${graceLabel}. Until then you can sign in and cancel the request at any time.`,
        "Booking and transaction records may be retained up to 7 years for legal compliance. Your profile name, email, phone, and avatar will be anonymized after the grace period.",
      ],
      cta: { label: "Cancel deletion request", href: cancelUrl },
      footnote: "If you did not request this, sign in immediately and cancel the deletion, then contact hello@usethrml.com.",
    },
  })
}
