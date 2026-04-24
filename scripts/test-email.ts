/**
 * Visual test for React Email templates.
 *
 *   npx tsx scripts/test-email.ts           → print HTML to stdout
 *   npx tsx scripts/test-email.ts --send    → send via Resend (needs RESEND_API_KEY)
 */
import { render } from "@react-email/render"
import { Resend } from "resend"

import ThrmlTemplate from "../emails/ThrmlTemplate"

const THRML_FROM = "Thrml <notifications@usethrml.com>"

async function testEmail() {
  const html = await render(
    ThrmlTemplate({
      title: "Your session with Cane's Canines is complete",
      bodyText:
        "Your payout of $17.00 is being processed by Stripe and should arrive within 2 business days.",
      ctaText: "View Payout Status",
      ctaUrl: "https://dashboard.stripe.com",
    })
  )

  const send = process.argv.includes("--send")
  if (!send) {
    console.log(html)
    return
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error("Set RESEND_API_KEY to use --send")
    process.exit(1)
  }

  const to = process.env.RESEND_TEST_TO_EMAIL?.trim()
  if (!to) {
    console.error("Set RESEND_TEST_TO_EMAIL (recipient) to use --send")
    process.exit(1)
  }

  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL?.trim() || THRML_FROM,
    to: [to],
    subject: "Branding Test — ThrmlTemplate",
    html,
  })

  if (error) {
    console.error("Resend error:", error)
    process.exit(1)
  }
  console.log("Sent:", data?.id ?? "(no id)")
}

void testEmail()
