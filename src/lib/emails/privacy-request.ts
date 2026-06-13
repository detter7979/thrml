import { sendThrmlLayoutEmail } from "@/lib/emails/transactional-send"

export async function sendPrivacyRequestConfirmationEmail(args: {
  userId: string | null
  email: string
  name: string
  ticketNumber: string
}): Promise<{ sent: boolean; error?: string }> {
  return sendThrmlLayoutEmail({
    to: args.email,
    subject: `We received your privacy request — ${args.ticketNumber}`,
    userId: args.userId,
    layout: {
      preview: `Privacy request received — ${args.ticketNumber}`,
      kicker: "Privacy",
      title: "We received your privacy request.",
      greeting: `Hi ${args.name},`,
      paragraphs: [
        `We received your privacy request and will respond within 30 days.`,
        `Reference: ${args.ticketNumber}`,
        "We will verify your identity using the email you provided before fulfilling access or deletion requests.",
      ],
    },
  })
}
