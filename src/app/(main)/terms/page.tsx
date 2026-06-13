import type { Metadata } from "next"

import { TERMS_OF_SERVICE_BODY } from "@/lib/legal/terms-of-service-body"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read thrml's Terms of Service governing use of our peer-to-peer wellness space marketplace.",
  alternates: { canonical: "https://usethrml.com/terms" },
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-[#1A1410] md:px-8">
      <h1 className="font-serif text-4xl">Terms of Service</h1>
      <p className="mt-2 text-sm text-[#5F5148]">thrml Wellness Marketplace - usethrml.com</p>
      <p className="mt-1 text-sm text-[#5F5148]">Effective Date: March 2026</p>

      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-[#2F241E]">
        {TERMS_OF_SERVICE_BODY}
      </div>
    </main>
  )
}
