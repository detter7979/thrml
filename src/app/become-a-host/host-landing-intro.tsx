"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { trackGaEvent } from "@/lib/analytics/ga"
import { hostSpaceTypesSentence } from "@/lib/host/host-funnel"

const WEEKS_PER_MONTH = 52 / 12

/** Monthly host earnings after thrml's host fee. Exported for tests. */
export function estimateMonthlyHostEarnings(input: {
  pricePerSession: number
  sessionsPerWeek: number
  hostFeePercent: number
}): number {
  const gross = input.pricePerSession * input.sessionsPerWeek * WEEKS_PER_MONTH
  return Math.round(gross * (1 - input.hostFeePercent / 100))
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  )
}

function EarningsEstimator({ hostFeePercent }: { hostFeePercent: number }) {
  const [price, setPrice] = useState(40)
  const [sessions, setSessions] = useState(4)
  const monthly = useMemo(
    () => estimateMonthlyHostEarnings({ pricePerSession: price, sessionsPerWeek: sessions, hostFeePercent }),
    [price, sessions, hostFeePercent]
  )

  return (
    <section className="space-y-4 rounded-2xl border border-[#F0E3D8] bg-white p-5">
      <div className="space-y-1">
        <h2 className="font-serif text-xl text-[#1A1410]">What could your sauna earn?</h2>
        <p className="text-xs text-neutral-500">Move the sliders to match your space.</p>
      </div>

      <label className="block space-y-2">
        <span className="flex justify-between text-sm text-[#2F241E]">
          <span>Price per session</span>
          <span className="font-semibold">{formatUsd(price)}</span>
        </span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={price}
          onChange={(event) => setPrice(Number(event.target.value))}
          onPointerUp={() => trackGaEvent("host_estimator_used", { field: "price" })}
          className="w-full accent-[#C4623A]"
          aria-label="Price per session"
        />
      </label>

      <label className="block space-y-2">
        <span className="flex justify-between text-sm text-[#2F241E]">
          <span>Sessions per week</span>
          <span className="font-semibold">{sessions}</span>
        </span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={sessions}
          onChange={(event) => setSessions(Number(event.target.value))}
          onPointerUp={() => trackGaEvent("host_estimator_used", { field: "sessions" })}
          className="w-full accent-[#C4623A]"
          aria-label="Sessions per week"
        />
      </label>

      <div className="rounded-xl bg-[#FFF5F0] px-4 py-3">
        <p className="text-xs text-neutral-500">Estimated monthly earnings, after thrml&apos;s fee</p>
        <p className="font-serif text-3xl text-[#1A1410]">{formatUsd(monthly)}</p>
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-400">
        Illustrative only — not a guarantee. Actual earnings depend on your price, availability and demand in your
        area.
      </p>
    </section>
  )
}

type Faq = { question: string; answer: string }

function buildFaqs(input: { hostKeepLabel: string; guestBookingsOpen: boolean; saunasOnly: boolean }): Faq[] {
  return [
    {
      question: "Do I need insurance?",
      answer:
        "Yes. thrml doesn't provide insurance for hosts or guests, so you'll confirm you carry liability coverage appropriate for hosting paid guests before your listing goes live. Many homeowner's policies don't cover paid guests — check with your insurance agent about adding coverage.",
    },
    {
      question: "What does it cost?",
      answer: `Listing is free. When a session is booked, thrml keeps a service fee and you keep ${input.hostKeepLabel} of your price. There are no monthly fees.`,
    },
    {
      question: "How do guests get in?",
      answer:
        "You choose: greet guests in person, or use a lockbox, keypad or smart lock. Access details are sent to the guest shortly before their session, and every guest agrees to your house rules at checkout.",
    },
    {
      question: "How and when do I get paid?",
      answer:
        "Payouts go through Stripe straight to your bank after each completed session. thrml never sees or stores your bank details.",
    },
    {
      question: "Am I in control of my schedule?",
      answer:
        "Completely. You set your hours, price and house rules, choose instant booking or approve each request, block dates whenever you need them, and can pause your listing anytime.",
    },
    {
      question: "What kinds of spaces can I list?",
      answer: `${hostSpaceTypesSentence(input.saunasOnly)} One space is plenty to start.`,
    },
    {
      question: "When will I get bookings?",
      answer: input.guestBookingsOpen
        ? "Guests can book now. Hosts who keep their calendar open and share their listing usually see bookings soonest."
        : "We're onboarding founding hosts across the Seattle area first, and we'll open bookings to guests once there's a strong mix of spaces. We'll email you before the first guests arrive, so you're live from day one.",
    },
  ]
}

export function HostLandingIntro({
  hostKeepLabel,
  hostFeePercent,
  guestBookingsOpen,
  saunasOnly,
  signedOut,
  loginHref,
  onStart,
  howItWorks,
}: {
  hostKeepLabel: string
  hostFeePercent: number
  guestBookingsOpen: boolean
  saunasOnly: boolean
  signedOut: boolean
  loginHref: string
  onStart: (placement: "hero" | "footer") => void
  howItWorks: React.ReactNode
}) {
  const faqs = buildFaqs({ hostKeepLabel, guestBookingsOpen, saunasOnly })
  const spaceNoun = saunasOnly ? "sauna" : "space"

  const startButton = (placement: "hero" | "footer") => (
    <Button
      className="h-12 w-full rounded-full bg-[#C4623A] text-base font-medium text-white hover:bg-[#b05530]"
      onClick={() => onStart(placement)}
    >
      {signedOut ? `List your ${spaceNoun} — it's free →` : "Get started →"}
    </Button>
  )

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {!guestBookingsOpen ? (
          <p className="inline-flex rounded-full bg-[#FFF0E8] px-3 py-1 text-xs font-medium text-[#A04A2A]">
            Now onboarding founding hosts in Seattle
          </p>
        ) : null}
        <h1 className="font-serif text-3xl leading-tight text-[#1A1410]">
          Your {spaceNoun} sits empty most of the week.
          <br />
          Let it earn.
        </h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          thrml lets people book private time in your {spaceNoun} by the session. You set the price, the hours and the
          rules — we handle bookings and payments.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
          <p className="text-lg font-semibold text-[#1A1410]">{hostKeepLabel}</p>
          <p className="text-xs text-neutral-400">You keep per booking</p>
        </div>
        <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
          <p className="text-lg font-semibold text-[#1A1410]">Free</p>
          <p className="text-xs text-neutral-400">To list your space</p>
        </div>
        <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
          <p className="text-lg font-semibold text-[#1A1410]">You</p>
          <p className="text-xs text-neutral-400">Set price &amp; hours</p>
        </div>
      </div>

      <div className="space-y-2">
        {startButton("hero")}
        {signedOut ? (
          <p className="text-center text-xs text-neutral-400">
            Already have an account?{" "}
            <Link href={loginHref} className="underline hover:text-neutral-600">
              Log in
            </Link>
          </p>
        ) : null}
      </div>

      <EarningsEstimator hostFeePercent={hostFeePercent} />

      <section className="space-y-2">
        <h2 className="font-serif text-xl text-[#1A1410]">How it works</h2>
        {howItWorks}
        <ol className="space-y-2 text-sm text-[#2F241E]">
          <li>
            <span className="font-medium">1. List your {spaceNoun}.</span>{" "}
            <span className="text-neutral-500">3+ photos, your price per session and your hours — about 10 minutes.</span>
          </li>
          <li>
            <span className="font-medium">2. Guests book.</span>{" "}
            <span className="text-neutral-500">Instantly or by request — your call. They agree to your house rules.</span>
          </li>
          <li>
            <span className="font-medium">3. You get paid.</span>{" "}
            <span className="text-neutral-500">Stripe pays you automatically after each session.</span>
          </li>
        </ol>
      </section>

      {!guestBookingsOpen ? (
        <section className="space-y-2 rounded-2xl border border-[#F0E3D8] bg-[#FFFAF6] p-5">
          <h2 className="font-serif text-xl text-[#1A1410]">Be a founding host</h2>
          <p className="text-sm leading-relaxed text-neutral-600">
            We&apos;re bringing on a small group of hosts across the Seattle area before we open bookings to guests.
            Founding hosts are live from day one, get a direct line to the people building thrml, and help shape how it
            works.
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-serif text-xl text-[#1A1410]">Questions hosts ask</h2>
        <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-100 bg-white">
          {faqs.map((faq) => (
            <details key={faq.question} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[#1A1410]">
                {faq.question}
                <span className="text-neutral-400 transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-xl text-[#1A1410]">Why we built thrml</h2>
        <p className="text-sm leading-relaxed text-neutral-600">
          We&apos;re a small Seattle team. The people who built backyard saunas and home recovery spaces have them
          sitting empty most of the day, while most people never get to experience one. thrml closes that gap — no
          memberships, no front desks, just private time in a space someone cared enough to build.
        </p>
        <Link href="/our-story" className="text-xs text-[#8B4513] underline underline-offset-2">
          Read our story
        </Link>
      </section>

      {startButton("footer")}
    </div>
  )
}
