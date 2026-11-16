import { renderThrmlEmail, buildPlainText } from "@/lib/emails/render-layout"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com").replace(/\/$/, "")

export type NewsletterWelcomeEmailData = {
  email: string
}

function getNewsletterLinks(email: string) {
  const exploreUrl = `${APP_URL}/explore`
  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`
  return { exploreUrl, unsubscribeUrl }
}

/** Welcome for people who joined the guest launch list before bookings opened. */
export async function launchWaitlistWelcome({
  email,
  launchLabel,
}: NewsletterWelcomeEmailData & { launchLabel: string }) {
  const { unsubscribeUrl } = getNewsletterLinks(email)
  const subject = `You're on the list — bookings open ${launchLabel}`

  const layout = {
    preview: `Private saunas in Seattle, bookable ${launchLabel}`,
    kicker: "Launch list",
    title: "You're on the list.",
    paragraphs: [
      `thrml opens for bookings on ${launchLabel}. You'll get one email that day with the private saunas you can book around Seattle.`,
      "Every sauna is hosted by a local whose ID is verified through Stripe. You book it by the session, it's yours alone for that time, and the cancellation policy is shown before you pay.",
      "Until then, nothing else from us unless it's worth your time.",
    ],
    footnote: `You're receiving this because you joined the thrml launch list at usethrml.com. Unsubscribe: ${unsubscribeUrl}`,
  }

  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)

  return { subject, html, text }
}

export async function newsletterWelcomeVariantA({ email }: NewsletterWelcomeEmailData) {
  const { exploreUrl, unsubscribeUrl } = getNewsletterLinks(email)
  const subject = "Welcome to Thrml 🌿"

  const layout = {
    preview: "Welcome to Thrml",
    kicker: "Newsletter",
    title: "You're in.",
    paragraphs: [
      "Welcome to Thrml — the easiest way to find and book private saunas, cold plunges, float tanks, and other recovery spaces near you.",
      "Most spaces start around $15/hour.",
      "Here's what to expect from us:",
    ],
    listItems: [
      "New spaces in your area",
      "Wellness tips and protocols",
      "Exclusive early access and offers",
    ],
    cta: { label: "Explore spaces near you", href: exploreUrl },
    footnote: `You're receiving this because you signed up at usethrml.com. Unsubscribe: ${unsubscribeUrl}`,
  }

  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)

  return { subject, html, text }
}
