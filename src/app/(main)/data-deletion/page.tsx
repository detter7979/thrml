import type { Metadata } from "next"
import Link from "next/link"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description:
    "How to request deletion of your personal data from thrml (usethrml.com).",
  alternates: { canonical: "https://usethrml.com/data-deletion" },
  robots: { index: true, follow: true },
}

const DELETION_EMAIL = "support@usethrml.com"

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#1A1410] md:px-8">
      <h1 className="font-serif text-4xl">Data Deletion Instructions</h1>
      <p className="mt-2 text-sm text-[#5F5148]">thrml — usethrml.com</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[#2F241E]">
        <p>
          If you used thrml through Facebook or Instagram, or you have a thrml account and want
          your personal data removed from our systems, you can request deletion using the steps
          below.
        </p>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-[#1A1410]">How to request deletion</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Email{" "}
              <a
                href={`mailto:${DELETION_EMAIL}?subject=Data%20deletion%20request`}
                className="text-[#C4623A] underline hover:text-[#b05530]"
              >
                {DELETION_EMAIL}
              </a>{" "}
              from the email address associated with your thrml account (or the address you used
              to sign in with Facebook, if applicable).
            </li>
            <li>
              Use the subject line <strong>Data deletion request</strong> and include your full
              name so we can locate your account.
            </li>
            <li>
              We will confirm receipt and process your request within <strong>30 days</strong>.
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-[#1A1410]">What we delete</h2>
          <p>
            We delete or anonymize personal data we control, such as your profile, messages, and
            marketing preferences, when deletion is not prohibited by law.
          </p>
          <p>
            Some records (for example completed bookings, payouts, and tax-related data) may be
            retained as required for legal, financial, and fraud-prevention obligations. See our{" "}
            <Link href="/privacy" className="text-[#C4623A] underline hover:text-[#b05530]">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-[#1A1410]">Questions</h2>
          <p>
            For other privacy requests, you may also contact{" "}
            <a
              href="mailto:hello@usethrml.com"
              className="text-[#C4623A] underline hover:text-[#b05530]"
            >
              hello@usethrml.com
            </a>
            . Our privacy team uses the same 30-day response window where applicable.
          </p>
        </section>
      </div>
    </main>
  )
}
