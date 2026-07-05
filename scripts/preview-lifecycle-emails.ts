/**
 * Render sample HTML for the lifecycle email system.
 *
 *   npx tsx scripts/preview-lifecycle-emails.ts
 *     → writes emails/previews/*.html
 *
 * Renders: bi-weekly newsletter, Stripe payout reminder, saved-spaces
 * reminder, and the legal-update notice — one file each, openable in a browser.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import type { SupabaseClient } from "@supabase/supabase-js"

import { renderThrmlEmail, type ThrmlEmailLayoutProps } from "../src/lib/emails/render-layout"
import { NEWSLETTER_EDITIONS } from "../src/lib/emails/newsletter-biweekly"
import { renderListingCardCompactHtml, type DigestListingRow } from "../src/lib/emails/weekly-digest"

const APP_URL = "https://usethrml.com"
const OUT_DIR = resolve(process.cwd(), "emails/previews")

const edition = NEWSLETTER_EDITIONS[0]

function mockListing(overrides: Partial<DigestListingRow>): DigestListingRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "Wellness space",
    service_type: "sauna",
    session_type: "hourly",
    fixed_session_price: null,
    price_solo: 25,
    location_city: null,
    city: "Austin",
    location_state: null,
    state: "TX",
    country: null,
    location: null,
    created_at: new Date().toISOString(),
    instant_book: true,
    listing_photos: [{ url: "https://picsum.photos/seed/sauna/264/198", order_index: 0 }],
    listing_ratings: { avg_overall: 4.9, review_count: 12 },
    ...overrides,
  }
}

// Compact cards never touch the client for http(s) photo URLs, so a stub is safe here.
const stubSupabase = null as unknown as SupabaseClient

const savedCardsHtml = [
  mockListing({ title: "Cedar Barrel Sauna & Plunge", price_solo: 32 }),
  mockListing({
    title: "The Steam Loft",
    service_type: "steam_room",
    price_solo: 28,
    listing_photos: [{ url: "https://picsum.photos/seed/steam/264/198", order_index: 0 }],
    listing_ratings: { avg_overall: 4.7, review_count: 8 },
  }),
  mockListing({
    title: "Hilltop Recovery Studio",
    service_type: "cold_plunge",
    city: "Dripping Springs",
    price_solo: 22,
    listing_photos: [],
    listing_ratings: null,
  }),
]
  .map((row) => renderListingCardCompactHtml(stubSupabase, row))
  .join("\n")

const samples: Record<string, ThrmlEmailLayoutProps> = {
  "biweekly-newsletter": {
    preview: edition.heroSubline,
    kicker: "The Thrml Dispatch",
    title: edition.subject,
    hero: {
      headline: edition.heroHeadline,
      subline: edition.heroSubline,
      cta: { label: "Book today", href: `${APP_URL}/explore` },
    },
    paragraphs: edition.paragraphs,
    listItems: edition.facts,
    cta: { label: "Find a space near you", href: `${APP_URL}/explore` },
    footnote: `You're receiving the Thrml Dispatch every two weeks. Unsubscribe: ${APP_URL}/unsubscribe`,
    appUrl: APP_URL,
  },
  "host-stripe-reminder": {
    preview: "Connect Stripe so payouts land the moment a booking completes",
    kicker: "Payouts",
    title: "Your listing is live. Your payouts aren't.",
    greeting: "Hi Jordan,",
    paragraphs: [
      "Your space is bookable, but without Stripe connected we can't pay you when sessions complete.",
      "It takes about 3 minutes — bank details, a quick identity check, done. Payouts then arrive automatically after each session.",
    ],
    cta: { label: "Connect Stripe payouts", href: `${APP_URL}/dashboard/account#payouts` },
    footnote: "Stripe is our payments partner. Thrml never sees or stores your bank credentials.",
    appUrl: APP_URL,
  },
  "guest-saved-reminder": {
    preview: "The spaces you saved are ready to book",
    kicker: "Your saved spaces",
    title: "You had good taste. Now take the plunge.",
    greeting: "Hi Sam,",
    paragraphs: ["You saved 3 spaces on Thrml but haven't booked a session yet:"],
    contentHtml: savedCardsHtml,
    cta: { label: "Book a saved space", href: `${APP_URL}/dashboard/saved` },
    footnote: "Popular time slots go first — weekend mornings fill up early.",
    appUrl: APP_URL,
  },
  "legal-update-notice": {
    preview: "Updates to the Thrml Privacy Policy, effective August 1, 2026",
    kicker: "Policy update",
    title: "Our Privacy Policy is changing.",
    paragraphs: [
      "We're updating the Thrml Privacy Policy, effective August 1, 2026. Here's a summary of what's changing:",
    ],
    listItems: [
      "Clearer explanation of how booking data is shared with hosts.",
      "New section covering consumer health data rights in Washington and Nevada.",
      "Updated data retention windows for deleted accounts.",
    ],
    cta: { label: "Read the updated Privacy Policy", href: `${APP_URL}/privacy` },
    footnote:
      "Continuing to use Thrml after the effective date means you accept the updated terms. This is a required service notice and is sent regardless of email preferences.",
    appUrl: APP_URL,
  },
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const [name, layout] of Object.entries(samples)) {
    const html = await renderThrmlEmail(layout)
    const outFile = resolve(OUT_DIR, `${name}.html`)
    writeFileSync(outFile, html)
    console.log(`wrote ${outFile}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
