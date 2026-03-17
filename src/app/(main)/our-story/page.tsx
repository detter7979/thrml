import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Our Story — Why We Built thrml",
  description:
    "thrml exists to make private wellness spaces — saunas, cold plunges, float tanks — accessible to everyone. No spa membership required.",
  alternates: { canonical: "https://usethrml.com/our-story" },
}

export default function OurStoryPage() {
  return (
    <main className="px-4 py-16 text-[#1A1410] md:px-8 md:py-24">
      <section className="mx-auto max-w-5xl">
        <h1 className="max-w-4xl font-serif text-4xl leading-[1.05] text-[#1A1410] md:text-6xl">
          Built for people who take recovery seriously
        </h1>
        <p className="mt-6 text-sm tracking-[0.08em] text-[#7B6D63]">
          Seattle · Los Angeles · More coming soon
        </p>
      </section>

      <section className="mx-auto mt-20 max-w-[65ch] space-y-9 text-base leading-relaxed text-[#2F241E] md:mt-24 md:text-lg">
        <p>
          Most people have never experienced a proper sauna, a true cold plunge, or an hour of genuine sensory
          stillness — not because they don&apos;t want to, but because access has always been the barrier. Wellness
          infrastructure worth having costs tens of thousands of dollars to build and lives behind spa memberships,
          hotel day passes, and waitlists.
        </p>

        <p>
          Meanwhile, the people who built these spaces — the biohackers, the recovery obsessives, the homeowners who
          poured their savings into a backyard barrel sauna — have them sitting empty most of the day.
        </p>

        <p className="border-l-2 border-[#C75B3A] pl-5 font-serif text-3xl leading-tight text-[#1A1410] md:text-4xl">
          thrml exists to close that gap.
        </p>

        <p>
          We built a marketplace that lets private wellness space owners share what they have built with people who
          are ready to experience it. No memberships. No front desks. Just a booking, an entry method, and an hour
          that is entirely yours.
        </p>

        <p>
          We are starting in Seattle and Los Angeles because those cities already have the culture — the cold plunge
          communities, the sauna clubs, the biohacking crowd. But the vision is bigger: a world where access to
          restorative wellness is not a luxury, it is something anyone can find in their neighborhood on a Tuesday
          afternoon.
        </p>

        <p>
          We are a small team building something we genuinely believe in. If you are a host with a space worth
          sharing, or a guest looking for something the mainstream wellness industry has not figured out yet —
          welcome.
        </p>
      </section>

      <section className="mx-auto mt-20 flex max-w-[65ch] flex-col items-center justify-center gap-4 sm:mt-24 sm:flex-row">
        <Link
          href="/explore"
          className="inline-flex min-w-[170px] items-center justify-center rounded-full border border-[#D9CEC2] px-6 py-3 text-sm font-medium text-[#2F241E] transition-colors hover:border-[#C75B3A] hover:text-[#C75B3A]"
        >
          Explore spaces →
        </Link>
        <Link
          href="/become-a-host"
          className="inline-flex min-w-[170px] items-center justify-center rounded-full border border-[#D9CEC2] px-6 py-3 text-sm font-medium text-[#2F241E] transition-colors hover:border-[#C75B3A] hover:text-[#C75B3A]"
        >
          List your space →
        </Link>
      </section>
    </main>
  )
}
