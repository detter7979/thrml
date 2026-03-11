import type { Metadata } from "next"

import { FaqPageClient } from "./faq-page-client"

export const metadata: Metadata = {
  title: "FAQ — Booking, Payments & Hosting on thrml",
  description:
    "Everything you need to know about booking private wellness spaces on thrml — payments, access codes, cancellations, and how to list your space.",
  alternates: { canonical: "https://usethrml.com/faq" },
}

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is thrml?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "thrml is a peer-to-peer marketplace that connects people with private wellness spaces — saunas, cold plunges, infrared light therapy, float tanks, PEMF, hyperbaric chambers, and more.",
      },
    },
    {
      "@type": "Question",
      name: "How does thrml work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Browse listings in your area, pick a date and time, and book instantly. After payment you receive entry instructions. Show up, use the space, and leave.",
      },
    },
    {
      "@type": "Question",
      name: "What is the service fee?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "thrml charges a 12% service fee on top of the listing price, shown transparently before checkout.",
      },
    },
    {
      "@type": "Question",
      name: "What is the cancellation policy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Cancellations more than 48 hours before the session receive a full refund minus the service fee. Cancellations within 48 hours are non-refundable.",
      },
    },
    {
      "@type": "Question",
      name: "How do I list my space on thrml?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Create a host account, complete your profile, and submit your listing through the host dashboard. Set your service type, pricing, availability, and photos.",
      },
    },
  ],
}

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <FaqPageClient />
    </>
  )
}
