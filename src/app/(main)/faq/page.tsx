import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "FAQs — Frequently Asked Questions",
  description: "Answers to common questions about booking private wellness spaces, hosting, payments, cancellations, and access on thrml.",
  alternates: { canonical: "https://usethrml.com/faq" },
}

const FAQS = [
  {
    question: "How do I book a space?",
    answer: "Browse available spaces on the explore page, select your date and time, and complete checkout. You'll receive an access code before your session.",
  },
  {
    question: "What is the cancellation policy?",
    answer: "Cancellation policies vary by listing — flexible, moderate, or strict. The policy is displayed on every listing page before you book.",
  },
  {
    question: "How do I get access to the space?",
    answer: "Most spaces use a digital access code sent to you before your session. The method (keypad, lockbox, or host on-site) is detailed on the listing.",
  },
  {
    question: "How much does thrml charge?",
    answer: "Guests pay a 12% service fee added to the listing price at checkout. Listing your space is free — hosts keep 88% of each booking.",
  },
  {
    question: "Can I list my own wellness space?",
    answer: "Yes. Visit the Become a Host page to list your sauna, cold plunge, infrared room, or other wellness space. Setup takes about 10 minutes.",
  },
  {
    question: "Is thrml available in my city?",
    answer: "thrml is currently live in Seattle and Los Angeles, with more cities coming soon. Browse the explore page to see what's available near you.",
  },
  {
    question: "How do I contact support?",
    answer: "Visit the Support page and submit a request. We respond within 24 hours.",
  },
]

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
}

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <main className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <h1 className="font-serif text-4xl text-[#1A1410] md:text-5xl">Frequently asked questions</h1>
        <div className="mt-12 space-y-8">
          {FAQS.map((faq) => (
            <div key={faq.question} className="border-b border-[#E7DED3] pb-8">
              <h2 className="font-serif text-xl text-[#1A1410]">{faq.question}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#5D4D41]">{faq.answer}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
