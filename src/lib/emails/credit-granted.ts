import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"

const APP_URL = THRML_APP_URL

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}

export async function sendCreditGrantedEmail(args: {
  to: string
  userId: string
  amountCents: number
  reason: string
}) {
  const amountLabel = formatUsd(args.amountCents)
  const dashboardUrl = `${APP_URL}/dashboard`

  return sendThrmlLayoutEmail({
    to: args.to,
    subject: "You have new Thrml credit",
    userId: args.userId,
    preferenceKey: "credit_grants",
    layout: {
      preview: `You've received ${amountLabel} in Thrml credit`,
      kicker: "Account credit",
      title: "You've received Thrml credit",
      creditHighlight: {
        headline: amountLabel,
        subline: args.reason.trim(),
      },
      paragraphs: [
        "We've added this to your Thrml wallet. At checkout, enable “Apply account credit” to use it on eligible bookings (combined with any referral balance, up to platform limits).",
      ],
      cta: { label: "Explore sessions", href: dashboardUrl },
    },
  })
}
