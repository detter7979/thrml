"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type FaqItem = {
  question: string
  answer: string
}

type FaqCategory = {
  title: string
  items: FaqItem[]
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: "Getting Started",
    items: [
      {
        question: "What is Thrml?",
        answer:
          "Thrml is a peer-to-peer marketplace that connects people with private wellness spaces - saunas, cold plunges, infrared light therapy, float tanks, contrast therapy, PEMF, hyperbaric chambers, and more. Think of it as a way to access high-quality wellness experiences hosted by real people in your city, without a gym membership or spa price tag.",
      },
      {
        question: "How does Thrml work?",
        answer:
          "Browse listings in your area, pick a date and time that works for you, and book instantly. After payment is confirmed you receive your host's entry instructions - this might be a digital access code, a lockbox combination, a key handoff, or another method the host has set up for their space. Show up, use the space during your booked window, and leave. Each listing describes its specific entry method so you always know what to expect before you book.",
      },
      {
        question: "Do I need an account to browse listings?",
        answer:
          "You can browse and view listings without an account. You only need to create an account when you are ready to book.",
      },
      {
        question: "Is Thrml available in my city?",
        answer:
          "Thrml is currently live in Seattle and Los Angeles with more cities coming soon. If you are a wellness space owner interested in hosting, reach out to us - we are always looking to expand to new markets.",
      },
    ],
  },
  {
    title: "Booking & Payments",
    items: [
      {
        question: "How do I book a session?",
        answer:
          "Find a listing you like, select your date and available time slot, choose your guest count, and click Reserve. You will be asked to read and accept a short assumption of risk waiver specific to the wellness modality, then complete payment through our secure checkout. Once payment is confirmed your booking is locked in and your access code is sent to you immediately.",
      },
      {
        question: "What payment methods are accepted?",
        answer:
          "We accept all major credit and debit cards through Stripe. Your payment information is handled securely by Stripe and is never stored on Thrml's servers.",
      },
      {
        question: "What is the service fee?",
        answer:
          "Thrml charges a 12% service fee on top of the listing price. This fee covers platform costs, payment processing, and our marketing and support services. The fee is always shown transparently before you confirm payment.",
      },
      {
        question: "Can I book for multiple people?",
        answer:
          "Yes, if the listing supports multiple guests. Each listing shows a maximum capacity - you can select your guest count at checkout and pricing will update accordingly.",
      },
      {
        question: "What is the cancellation policy?",
        answer:
          "Cancellations made more than 48 hours before your session start time receive a full refund minus the platform service fee. Cancellations within 48 hours of the session are non-refundable. If the host cancels for any reason you receive a full refund including the service fee. Some listings may have custom cancellation terms - always check the listing before booking.",
      },
      {
        question: "What if I need to reschedule?",
        answer:
          "Rescheduling is handled by cancelling your existing booking and rebooking your preferred time. Standard cancellation terms apply, so we recommend rescheduling well in advance.",
      },
      {
        question: "Why was my payment declined?",
        answer:
          "Payment issues are handled by Stripe and your card issuer. Common causes include incorrect card details, insufficient funds, or a bank security flag on an unfamiliar charge. Try a different card or contact your bank. If the issue persists reach out to us at hello@usethrml.com.",
      },
    ],
  },
  {
    title: "Access & Entry Issues",
    items: [
      {
        question: "How do I access the space when I arrive?",
        answer:
          "Once your booking is confirmed you receive entry instructions by email and in your booking dashboard. Entry methods vary by host - some use a digital access code sent through the platform, others use a lockbox, a key handoff, or a door code they share directly in their listing instructions. Check your booking confirmation and the listing's entry instructions before you head over so you know exactly what to expect.",
      },
      {
        question: "My access code isn't working",
        answer:
          "If your host uses a digital access code, first confirm you are at the correct address and entering the code exactly as provided - try copying and pasting from your confirmation email rather than typing it manually.\n\nIf your host uses a different entry method (lockbox, key, door code) and you are having trouble, refer to the entry instructions in your booking confirmation or the listing detail page.\n\nIf you still cannot get in, message the host directly through your Thrml dashboard - hosts are notified immediately and most respond within minutes. If you cannot reach the host within 10 minutes of your session start time, email us at hello@usethrml.com with your booking ID and we will step in right away.",
      },
      {
        question: "Can I share my access code with someone else?",
        answer:
          "Entry details - whether a digital code, lockbox combination, or other method - are intended for your confirmed booking party only and should not be shared with anyone outside your booked guests. Sharing entry information with unauthorized individuals is a violation of our Terms of Service and may result in account suspension.",
      },
      {
        question: "I arrived late and my code stopped working",
        answer:
          "If your host uses a digital access code, codes are active for your booked session window only and expire at your session end time. If you arrived after your session window closed the code will no longer be valid.\n\nFor other entry methods, your access window is still tied to your booked time - arriving after your session ends means the booking has lapsed. For future sessions we recommend arriving a few minutes early. If you believe there was a technical error with your access window contact support with your booking ID.",
      },
    ],
  },
  {
    title: "Health & Safety",
    items: [
      {
        question: "Is Thrml safe to use?",
        answer:
          "Thrml is a marketplace - we connect you with independently owned and operated wellness spaces. We do not inspect or certify listings, so we encourage you to read listing descriptions carefully, check reviews, and communicate with hosts if you have questions about a specific space before booking.",
      },
      {
        question: "What is the assumption of risk waiver?",
        answer:
          "Before completing checkout you will be asked to read and accept a short waiver specific to the wellness modality you are booking - for example a cold plunge waiver covers cold shock and cardiac risks, while a sauna waiver covers heat-related risks. This is a brief plain-language document, not fine print. It confirms you are physically fit to participate and understand the inherent risks of the activity.",
      },
      {
        question: "Should I consult a doctor before booking?",
        answer:
          "We strongly recommend it if you have any of the following: cardiovascular conditions, high or low blood pressure, are pregnant, have epilepsy or claustrophobia, take medications affecting circulation or heat regulation, or have recently had surgery. Each listing's waiver lists the specific contraindications for that modality.",
      },
      {
        question: "Are these services medical treatments?",
        answer:
          "No. Wellness experiences on Thrml are not medical treatments and are not a substitute for professional medical advice, diagnosis, or treatment. If you have a health condition please consult a licensed healthcare provider before booking.",
      },
      {
        question: "What if I feel unwell during a session?",
        answer:
          "Stop immediately, exit the space, and seek fresh air and hydration. If you feel you need medical attention call 911. In non-emergency situations you can contact the host through the app. Never hesitate to end a session early if you feel uncomfortable - your safety comes first.",
      },
    ],
  },
  {
    title: "For Hosts",
    items: [
      {
        question: "How do I list my space on Thrml?",
        answer:
          "Create a host account, complete your profile, and submit your listing through the host dashboard. You will set your service type, pricing, availability, amenities, house rules, and upload photos. Listings are reviewed before going live.",
      },
      {
        question: "How does host payout work?",
        answer:
          "Payouts are processed through Stripe Connect. You will complete a one-time Stripe identity verification during onboarding. After a booking is completed you receive 88% of the booking subtotal - Thrml retains a 12% platform fee. Payouts are processed on Stripe's standard payout schedule to your connected bank account.",
      },
      {
        question: "When do I receive the guest's access code?",
        answer:
          "If your listing uses a digital access code generated by Thrml, you and your guest both receive it automatically as soon as the booking is confirmed - by email and in your host dashboard.\n\nIf you manage entry through your own method (a lockbox combination, a door code, a key handoff, or similar), you are responsible for sharing those instructions with your guest promptly after booking confirmation. We recommend including clear entry instructions in your listing description so guests know what to expect before they arrive. You can also send details through the Thrml messaging system.\n\nWhichever entry method you use, please ensure it is working correctly before each session.",
      },
      {
        question: "Can I block off dates when I am unavailable?",
        answer:
          "Yes. In your host dashboard under listing management you can add blackout dates for vacations, maintenance, or any other reason. Blackout dates immediately prevent new bookings on those dates. Note that you cannot block a date that already has a confirmed booking - you would need to handle that booking first.",
      },
      {
        question: "What is Thrml's marketing service?",
        answer:
          "As part of listing on Thrml, your space may be featured across Thrml's social media channels and digital marketing campaigns at our discretion. This is included with your listing at no extra cost. If you prefer to opt out of social promotion contact us at hello@usethrml.com.",
      },
      {
        question: "Am I required to have insurance?",
        answer:
          "Thrml does not provide insurance coverage for hosts or guests. We strongly recommend all hosts carry appropriate property and liability insurance for hosted activities. Consult an insurance professional to ensure your policy covers short-term wellness space rentals.",
      },
      {
        question: "How are host ratings calculated?",
        answer:
          "Your overall rating is the average of rating_overall scores across all reviews on all of your listings. Guests also rate individual dimensions including cleanliness, accuracy, communication, and value. All of these are visible on your public host profile.",
      },
    ],
  },
  {
    title: "Reviews & Ratings",
    items: [
      {
        question: "When can I leave a review?",
        answer:
          "You can submit a review after your booking is marked as completed. Reviews are available in your booking history in the dashboard.",
      },
      {
        question: "What can I rate?",
        answer:
          "You rate the overall experience plus four specific dimensions: cleanliness, accuracy of the listing description, host communication, and value for money.",
      },
      {
        question: "Can a host respond to my review?",
        answer:
          "Yes. Hosts can post a public response to any guest review. Responses are visible on the listing page alongside your review.",
      },
      {
        question: "Can reviews be removed?",
        answer:
          "Thrml moderates reviews and may remove them if they contain false statements, personal attacks, or violate our community guidelines. Hosts cannot remove reviews simply because they disagree with them.",
      },
    ],
  },
]

function escapeRegex(query: string) {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlightMatches(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return text

  const regex = new RegExp(`(${escapeRegex(trimmed)})`, "gi")
  return text.split(regex).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={`${part}-${index}`} className="rounded bg-[#F5C7A8]/60 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export default function FaqPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [openItems, setOpenItems] = useState<Record<string, string | null>>({})

  const filteredCategories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return FAQ_CATEGORIES

    return FAQ_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const question = item.question.toLowerCase()
        const answer = item.answer.toLowerCase()
        return question.includes(query) || answer.includes(query)
      }),
    })).filter((category) => category.items.length > 0)
  }, [searchTerm])

  const hasResults = filteredCategories.length > 0

  const toggleItem = (categoryTitle: string, question: string) => {
    setOpenItems((current) => ({
      ...current,
      [categoryTitle]: current[categoryTitle] === question ? null : question,
    }))
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 text-[#1A1410] md:px-8 md:py-16">
      <header className="max-w-3xl">
        <h1 className="font-serif text-4xl md:text-5xl">Frequently Asked Questions</h1>
        <p className="mt-4 text-base text-[#5F5148]">
          Everything you need to know about booking and hosting on Thrml
        </p>
      </header>

      <div className="mt-8 rounded-2xl border border-warm-100 bg-white p-4 shadow-sm md:p-5">
        <label htmlFor="faq-search" className="sr-only">
          Search FAQ
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A776A]" />
          <Input
            id="faq-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search questions and answers..."
            className="h-12 rounded-xl border-warm-100 bg-[#FCFAF7] pl-10 text-[15px] text-[#1A1410] placeholder:text-[#8A776A]"
          />
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {hasResults ? (
          filteredCategories.map((category) => (
            <section key={category.title} aria-labelledby={`faq-category-${category.title}`}>
              <h2
                id={`faq-category-${category.title}`}
                className="mb-4 border-b border-warm-100 pb-3 font-serif text-2xl text-[#1A1410]"
              >
                {category.title}
              </h2>

              <div className="space-y-3">
                {category.items.map((item) => {
                  const isOpen = openItems[category.title] === item.question
                  const answerId = `${category.title}-${item.question}-answer`
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")

                  return (
                    <article
                      key={item.question}
                      className="overflow-hidden rounded-2xl border border-warm-100 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleItem(category.title, item.question)}
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left text-[15px] font-medium text-[#1A1410] transition-colors hover:bg-[#FCFAF7] md:px-5 md:text-base"
                      >
                        <span>{highlightMatches(item.question, searchTerm)}</span>
                        <ChevronDown
                          className={cn(
                            "size-5 shrink-0 text-[#6D5D52] transition-transform duration-300",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>

                      <div
                        className={cn(
                          "grid transition-all duration-300 ease-out",
                          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}
                      >
                        <div className="overflow-hidden">
                          <p id={answerId} className="px-4 pb-4 text-sm leading-relaxed text-[#2F241E] md:px-5 md:text-[15px]">
                            {highlightMatches(item.answer, searchTerm)}
                          </p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        ) : (
          <section className="rounded-2xl border border-warm-100 bg-white p-6 text-sm text-[#5F5148]">
            No matches found for <span className="font-medium text-[#1A1410]">{searchTerm}</span>. Try a different
            keyword.
          </section>
        )}
      </div>

      <div className="mt-10 rounded-2xl border border-warm-100 bg-white p-6 text-sm text-[#2F241E]">
        Still have questions? Contact us at{" "}
        <a href="mailto:hello@usethrml.com" className="font-medium text-[#C75B3A] hover:text-[#B45033]">
          hello@usethrml.com
        </a>
        <p className="mt-3 text-[#5F5148]">
          <Link href="/support" className="font-medium text-[#C75B3A] hover:text-[#B45033]">
            Need more help? Visit our Support page &rarr;
          </Link>
        </p>
      </div>
    </main>
  )
}
