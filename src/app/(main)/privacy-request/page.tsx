import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { PrivacyRequestClient } from "./privacy-request-client"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Privacy Request",
  description: "Submit a privacy, data access, deletion, or opt-out request to thrml.",
  alternates: { canonical: "https://usethrml.com/privacy-request" },
  robots: { index: true, follow: true },
}

export default async function PrivacyRequestPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let initialName = ""
  let initialEmail = user?.email ?? ""

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
    if (typeof profile?.full_name === "string" && profile.full_name.trim()) {
      initialName = profile.full_name.trim()
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#1A1410] md:px-8 md:py-16">
      <header>
        <h1 className="font-serif text-4xl">Privacy request</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#5F5148]">
          Use this form to exercise your privacy rights under applicable state laws — including access, correction,
          deletion, portability, opt-out of sale or sharing, and consumer health data requests. You do not need an
          account to submit a request.
        </p>
      </header>

      <div className="mt-8 rounded-2xl border border-warm-100 bg-white p-6 shadow-sm md:p-8">
        <PrivacyRequestClient initialName={initialName} initialEmail={initialEmail} />
      </div>
    </main>
  )
}
