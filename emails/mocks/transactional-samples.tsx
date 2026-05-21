import { ThrmlEmailLayout, type ThrmlEmailLayoutProps } from "../ThrmlEmailLayout"

const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com"

export type MockVariant = "guest-confirm" | "host-booking" | "access-code"

export const MOCK_VARIANTS: MockVariant[] = ["guest-confirm", "host-booking", "access-code"]

export function mockPropsForVariant(variant: MockVariant): ThrmlEmailLayoutProps {
  switch (variant) {
    case "guest-confirm":
      return {
        preview: "Your booking is confirmed — Cedar Sauna on Saturday",
        kicker: "Booking confirmed",
        title: "You're booked.",
        greeting: "Hi Alex,",
        summary: [
          { label: "Space", value: "🔥 Cedar Sauna · Private barrel sauna" },
          { label: "When", value: "Saturday, May 24 · 2:00 PM – 3:00 PM" },
          { label: "Host", value: "Jordan M." },
          { label: "Total paid", value: "$45.00" },
        ],
        paragraphs: [
          "Your access code will be sent 2 hours before your session.",
          "Free cancellation until Friday, May 23 at 2:00 PM.",
        ],
        cta: { label: "View booking details", href: `${APP}/dashboard/bookings/mock-booking-id` },
        footnote: "Questions? Reply to this email or message your host in the app.",
        appUrl: APP,
      }

    case "host-booking":
      return {
        preview: "New booking — Alex K. on Saturday",
        kicker: "New booking",
        title: "You have a new confirmed booking.",
        greeting: "Hi Jordan,",
        summary: [
          { label: "Guest", value: "Alex K. · 2 guests" },
          { label: "Space", value: "Cedar Sauna" },
          { label: "When", value: "Saturday, May 24 · 2:00 PM – 3:00 PM" },
          { label: "Your payout", value: "$38.25" },
        ],
        paragraphs: [
          "Access details will be sent to your guest automatically 2 hours before their session. No action needed.",
        ],
        cta: { label: "View booking", href: `${APP}/dashboard/bookings/mock-booking-id` },
        appUrl: APP,
      }

    case "access-code":
      return {
        preview: "Your access details — Cedar Sauna",
        kicker: "Access details",
        title: "Here's how to get in.",
        greeting: "Hi Alex,",
        summary: [
          { label: "Space", value: "Cedar Sauna" },
          { label: "When", value: "Saturday, May 24 · 2:00 PM – 3:00 PM" },
          { label: "Access code", value: "4829" },
        ],
        paragraphs: [
          "Enter through the side gate and use the keypad on the sauna door. Towels are in the bench cubby.",
          "Please arrive on time — your session ends promptly at 3:00 PM.",
        ],
        cta: { label: "View booking details", href: `${APP}/dashboard/bookings/mock-booking-id` },
        footnote: "Having trouble? Message Jordan directly in the app.",
        appUrl: APP,
      }
  }
}

export function MockEmail({ variant }: { variant: MockVariant }) {
  return <ThrmlEmailLayout {...mockPropsForVariant(variant)} />
}
