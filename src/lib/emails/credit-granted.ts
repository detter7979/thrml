import { render } from "@react-email/render"

import ThrmlTemplate from "../../../emails/ThrmlTemplate"
import { sendEmail } from "@/lib/emails/send"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com"

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

  const html = await render(
    ThrmlTemplate({
      title: "You’ve received Thrml credit",
      editorial: true,
      bodyText: `We’ve added ${amountLabel} to your Thrml wallet. At checkout, enable “Apply account credit” to use it on eligible bookings (combined with any referral balance, up to platform limits).`,
      ctaText: "Explore sessions",
      ctaUrl: dashboardUrl,
      creditBanner: {
        headline: amountLabel,
        subline: args.reason.trim(),
      },
    })
  )

  const text = [
    `You've received ${amountLabel} in Thrml credit.`,
    "",
    `Note from Thrml: ${args.reason.trim()}`,
    "",
    `Book: ${dashboardUrl}`,
  ].join("\n")

  return sendEmail({
    to: args.to,
    subject: "You have new Thrml credit",
    html,
    text,
    userId: args.userId,
    preferenceKey: "credit_grants",
  })
}
