"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { trackMetaEvent } from "@/components/meta-pixel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { trackGaEvent } from "@/lib/analytics/ga"
import { trackHostOnboardingComplete } from "@/lib/tracking/google-ads"
import { createClient } from "@/lib/supabase/client"

const HOST_TERMS_VERSION = "host-v1.0-2026-03"
const TOTAL_STEPS = 3

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-[#C4623A] transition-all duration-500"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  )
}

function HowItWorksAnimation() {
  return (
    <div className="flex select-none items-center justify-center gap-0 py-8">
      <div className="animate-[fadeSlideIn_0.5s_ease_0.1s_both] flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-[#F5D5C8] bg-[#FFF5F0]">
          <span className="text-3xl">📸</span>
        </div>
        <span className="w-16 text-center text-xs font-medium text-neutral-600">List your space</span>
      </div>

      <div className="animate-[fadeSlideIn_0.5s_ease_0.35s_both] flex items-center px-1 pb-6">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="size-1 animate-[pulse_1.5s_ease_infinite] rounded-full bg-[#C4623A]"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>

      <div className="animate-[fadeSlideIn_0.5s_ease_0.4s_both] flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-[#F5D5C8] bg-[#FFF5F0]">
          <span className="text-3xl">📅</span>
        </div>
        <span className="w-16 text-center text-xs font-medium text-neutral-600">Guest books</span>
      </div>

      <div className="animate-[fadeSlideIn_0.5s_ease_0.65s_both] flex items-center px-1 pb-6">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="size-1 animate-[pulse_1.5s_ease_infinite] rounded-full bg-[#C4623A]"
              style={{ animationDelay: `${i * 0.15 + 0.75}s` }}
            />
          ))}
        </div>
      </div>

      <div className="animate-[fadeSlideIn_0.5s_ease_0.7s_both] flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-[#F5D5C8] bg-[#FFF5F0]">
          <span className="text-3xl">💰</span>
        </div>
        <span className="w-16 text-center text-xs font-medium text-neutral-600">You earn</span>
      </div>
    </div>
  )
}

const GROUND_RULES = [
  {
    icon: "✅",
    title: "Describe your space accurately",
    body: "Photos and descriptions should honestly represent what guests will experience.",
  },
  {
    icon: "🧹",
    title: "Keep it clean and ready",
    body: "Your space should be clean, functional, and prepared before each session.",
  },
  {
    icon: "💬",
    title: "Respond promptly",
    body: "Reply to booking requests and messages within 24 hours where possible.",
  },
  {
    icon: "📋",
    title: "Set your house rules clearly",
    body: "Use your listing to communicate expectations - guests agree to your rules at checkout.",
  },
  {
    icon: "💳",
    title: "Payments through Thrml only",
    body: "Never accept payment outside the platform. Thrml handles all transactions securely.",
  },
]

export function BecomeAHostClient() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    trackGaEvent("host_onboarding_start", { step: 1 })
    trackMetaEvent("ViewContent", {
      content_name: "host_onboarding_start",
      content_type: "host_onboarding",
    })
  }, [])

  function handleStep1Continue() {
    setStep(2)
    trackGaEvent("host_onboarding_step", { step: 2 })
  }

  function handleRulesAccept() {
    if (!rulesAccepted) return
    setStep(3)
    trackGaEvent("host_onboarding_rules_accepted", { step: 3 })
    trackMetaEvent("ViewContent", {
      content_name: "host_onboarding_rules_accepted",
      content_type: "host_onboarding",
    })
  }

  async function handleTermsAccept() {
    if (!termsAccepted) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await supabase
          .from("profiles")
          .update({
            host_terms_accepted: true,
            host_terms_accepted_at: new Date().toISOString(),
            host_terms_version: HOST_TERMS_VERSION,
          })
          .eq("id", user.id)
      }

      trackGaEvent("host_onboarding_complete", {
        step: 3,
        terms_version: HOST_TERMS_VERSION,
      })
      trackMetaEvent("Lead", {
        content_name: "host_onboarding_complete",
        content_type: "host_onboarding",
      })
      trackHostOnboardingComplete()

      router.push("/dashboard/host/new")
    } catch {
      setError("Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FCFAF7]">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-2xl lowercase tracking-tight text-[#1A1410]">
          thrml
        </Link>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-600">
          Exit
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-start px-6 pt-4 pb-12">
        <div className="w-full max-w-lg space-y-6">
          <ProgressBar step={step} />

          {step === 1 ? (
            <div className="animate-[fadeSlideIn_0.3s_ease_both] space-y-6">
              <div className="space-y-2">
                <h1 className="font-serif text-3xl leading-tight text-[#1A1410]">
                  Earn from your space.
                  <br />
                  We handle the rest.
                </h1>
                <p className="text-sm leading-relaxed text-neutral-500">
                  Thrml connects you with guests looking for private wellness experiences. Set your
                  price, your hours, and your rules - we take care of bookings and payments.
                </p>
              </div>

              <HowItWorksAnimation />

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
                  <p className="text-lg font-semibold text-[#1A1410]">88%</p>
                  <p className="text-xs text-neutral-400">You keep per booking</p>
                </div>
                <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
                  <p className="text-lg font-semibold text-[#1A1410]">2 days</p>
                  <p className="text-xs text-neutral-400">Stripe payout time</p>
                </div>
                <div className="space-y-1 rounded-xl border border-neutral-100 bg-white p-3">
                  <p className="text-lg font-semibold text-[#1A1410]">Free</p>
                  <p className="text-xs text-neutral-400">To list your space</p>
                </div>
              </div>

              <Button
                className="h-12 w-full rounded-full bg-[#C4623A] text-base font-medium text-white hover:bg-[#b05530]"
                onClick={handleStep1Continue}
              >
                Get started →
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="animate-[fadeSlideIn_0.3s_ease_both] space-y-6">
              <div className="space-y-2">
                <h1 className="font-serif text-3xl text-[#1A1410]">A few ground rules</h1>
                <p className="text-sm leading-relaxed text-neutral-500">
                  Thrml hosts share a commitment to quality experiences. These are not complicated
                  - they are just good hosting.
                </p>
              </div>

              <div className="space-y-3">
                {GROUND_RULES.map((rule) => (
                  <div
                    key={rule.title}
                    className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-white p-4"
                  >
                    <span className="mt-0.5 shrink-0 text-xl">{rule.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-[#1A1410]">{rule.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{rule.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7DED3] bg-white p-4">
                <Checkbox
                  checked={rulesAccepted}
                  onCheckedChange={(checked) => setRulesAccepted(Boolean(checked))}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed text-[#1A1410]">
                  I understand and agree to host responsibly on Thrml.
                </span>
              </label>

              <Button
                className="h-12 w-full rounded-full bg-[#C4623A] text-base font-medium text-white hover:bg-[#b05530] disabled:opacity-40"
                onClick={handleRulesAccept}
                disabled={!rulesAccepted}
              >
                Agree and continue →
              </Button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600"
              >
                ← Back
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="animate-[fadeSlideIn_0.3s_ease_both] space-y-6">
              <div className="space-y-2">
                <h1 className="font-serif text-3xl text-[#1A1410]">Host agreement</h1>
                <p className="text-sm leading-relaxed text-neutral-500">
                  A brief summary of what you are agreeing to as a Thrml host.
                </p>
              </div>

              <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-neutral-100 bg-white p-5 text-sm leading-relaxed text-[#2F241E]">
                <div className="space-y-1">
                  <p className="font-semibold">Independent host status</p>
                  <p className="text-xs text-neutral-500">
                    You are an independent host, not an employee or agent of Thrml. You are
                    responsible for the operation, safety, and condition of your space and the
                    experiences you provide.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Space safety and compliance</p>
                  <p className="text-xs text-neutral-500">
                    You confirm your space is safe, functional, and legally permitted for the
                    activities listed. You are responsible for ensuring your space meets any
                    applicable local regulations.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Insurance recommendation</p>
                  <p className="text-xs text-neutral-500">
                    Thrml does not provide insurance coverage for hosts or guests. We strongly
                    recommend carrying appropriate property and liability insurance for short-term
                    wellness space rental activities. Consult an insurance professional to confirm
                    your coverage.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Accurate listings</p>
                  <p className="text-xs text-neutral-500">
                    You agree to represent your space accurately and update your listing if
                    anything material changes. Misleading listings may result in removal from the
                    platform.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Platform payments</p>
                  <p className="text-xs text-neutral-500">
                    All payments must be processed through Thrml. Accepting payment outside the
                    platform is a violation of the Host Terms and may result in account suspension.
                  </p>
                </div>
                <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-400">
                  By agreeing, you also accept Thrml&apos;s{" "}
                  <Link href="/terms" target="_blank" className="underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="underline">
                    Privacy Policy
                  </Link>
                  . Version: {HOST_TERMS_VERSION}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7DED3] bg-white p-4">
                <Checkbox
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(Boolean(checked))}
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed text-[#1A1410]">
                  I accept the Thrml Host Terms and confirm I have read the agreement above.
                </span>
              </label>

              {error ? <p className="text-sm text-red-500">{error}</p> : null}

              <Button
                className="h-12 w-full rounded-full bg-[#C4623A] text-base font-medium text-white hover:bg-[#b05530] disabled:opacity-40"
                onClick={handleTermsAccept}
                disabled={!termsAccepted || saving}
              >
                {saving ? "Saving..." : "Start my listing →"}
              </Button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full text-center text-xs text-neutral-400 hover:text-neutral-600"
              >
                ← Back
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
