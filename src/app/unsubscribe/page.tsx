"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

type UnsubscribeState = "idle" | "loading" | "success" | "error"

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function UnsubscribeContent() {
  const searchParams = useSearchParams()
  const email = useMemo(() => (searchParams.get("email") ?? "").trim().toLowerCase(), [searchParams])
  const [state, setState] = useState<UnsubscribeState>("idle")

  useEffect(() => {
    let cancelled = false

    async function runUnsubscribe() {
      if (!VALID_EMAIL_REGEX.test(email)) {
        if (!cancelled) setState("error")
        return
      }

      if (!cancelled) setState("loading")

      try {
        const response = await fetch("/api/newsletter/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })

        if (!cancelled) {
          setState(response.ok ? "success" : "error")
        }
      } catch {
        if (!cancelled) setState("error")
      }
    }

    void runUnsubscribe()

    return () => {
      cancelled = true
    }
  }, [email])

  return (
    <main className="min-h-screen bg-[#FAF7F4] px-4 py-20">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#E8DDD3] bg-white p-8 text-[#2C2420] shadow-sm">
        <p className="text-xs tracking-[0.2em] text-[#8B4513]">THERMAL</p>
        <h1 className="mt-4 font-serif text-3xl">Email Preferences</h1>

        {state === "loading" && <p className="mt-4 text-sm text-[#5B4A40]">Updating your preferences...</p>}

        {state === "success" && (
          <p className="mt-4 text-base">
            You've been unsubscribed.
            <br />
            You won't hear from us again.
          </p>
        )}

        {state === "error" && (
          <p className="mt-4 text-sm text-[#8B4513]">
            We couldn't process that unsubscribe link. Please try again from the email you received.
          </p>
        )}
      </section>
    </main>
  )
}

function UnsubscribeFallback() {
  return (
    <main className="min-h-screen bg-[#FAF7F4] px-4 py-20">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#E8DDD3] bg-white p-8 text-[#2C2420] shadow-sm">
        <p className="text-xs tracking-[0.2em] text-[#8B4513]">THERMAL</p>
        <h1 className="mt-4 font-serif text-3xl">Email Preferences</h1>
        <p className="mt-4 text-sm text-[#5B4A40]">Loading unsubscribe details...</p>
      </section>
    </main>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<UnsubscribeFallback />}>
      <UnsubscribeContent />
    </Suspense>
  )
}
