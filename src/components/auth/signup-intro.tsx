"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"

import {
  ChooseIllustration,
  ExperienceIllustration,
  IntroIllustration,
} from "@/components/onboarding/onboarding-illustrations"
import { trackGaEvent } from "@/lib/analytics/ga"
import type { AppIntent } from "@/lib/app-nav"
import { cn } from "@/lib/utils"

const STEPS = 3

const ROLES: Array<{ id: AppIntent; title: string; body: string }> = [
  { id: "guest", title: "Find a sauna", body: "Explore private saunas near you." },
  { id: "host", title: "List my sauna", body: "Start earning from your space." },
  { id: "both", title: "A little of both", body: "Explore saunas and become a host." },
]

/** Quiet, non-tappable facts on screen 1: nothing here should pull people out of the intro. */
const HIGHLIGHTS = ["Private sessions", "Local hosts"]

const eyebrow = "text-[12px] font-medium tracking-[0.16em] text-[#A8472B] uppercase"
const headline = "font-serif text-[34px] leading-[1.06] text-[#1A1410] [text-wrap:balance]"
const bodyText = "text-[16px] leading-relaxed text-[#7A6355] [text-wrap:pretty]"
const primaryButton =
  "inline-flex h-[52px] items-center justify-center rounded-full bg-[#1A1410] px-8 text-[15px] font-medium text-[#F7F3EE] transition-opacity disabled:opacity-35"
const quietButton = "inline-flex h-11 items-center px-1 text-[15px] text-[#7A6355]"

function Progress({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <span key={i} className={cn("h-[3px] flex-1 rounded-full", i <= step ? "bg-[#1A1410]" : "bg-[#DDD4C8]")} />
      ))}
    </div>
  )
}

/** A button when a handler is given (in-app overlay), otherwise a plain link (web pages). */
function Action({
  onClick,
  href,
  className,
  children,
}: {
  onClick?: () => void
  href: string
  className?: string
  children: ReactNode
}) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

/**
 * Three-screen intro: what thrml is (for guests and hosts), how a visit works (and that
 * hosts set their own hours), then a starting point. The choice personalizes the next step only:
 * every account can book and host.
 */
export function SignupIntro({
  intent,
  onIntent,
  onContinue,
  onLookAround,
  onLogin,
}: {
  /** Nothing is preselected: null until the person picks. */
  intent: AppIntent | null
  onIntent: (intent: AppIntent) => void
  onContinue: () => void
  onLookAround?: () => void
  onLogin?: () => void
}) {
  const [step, setStep] = useState(0)

  function go(next: number) {
    setStep(next)
    trackGaEvent("onboarding_step_view", { step: next + 1 })
  }

  const header = (left: ReactNode) => (
    <div className="flex items-center justify-between">
      {left}
      <Action onClick={onLogin} href="/login" className="inline-flex h-11 items-center px-1 text-[15px] text-[#1A1410]">
        Log in
      </Action>
    </div>
  )

  const logo = <span className="font-serif text-[28px] tracking-[-0.01em] text-[#1A1410]">thrml</span>

  return (
    <div className="flex h-[100svh] flex-col overflow-y-auto bg-[#F7F3EE] text-[#1A1410]">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-6 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),20px)]">
        {step === 0 ? (
          <>
            {header(logo)}
            <div className="relative -mx-6 mt-2 min-h-[120px] flex-1">
              <IntroIllustration className="absolute inset-0" />
            </div>
            <div className="mt-5 space-y-3">
              <p className={eyebrow}>Discover. Book. Host.</p>
              <h1 className={headline}>Sauna, on your terms.</h1>
              <p className={bodyText}>Discover private saunas near you, or earn by listing your own.</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[14px] text-[#7A6355]" aria-label="What thrml offers">
                {HIGHLIGHTS.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C75B3A]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 space-y-5">
              <Progress step={0} />
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => go(2)} className={quietButton}>
                  Skip
                </button>
                <button type="button" onClick={() => go(1)} className={primaryButton}>
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            {header(logo)}
            <div className="relative -mx-6 mt-2 min-h-[120px] flex-1">
              <ExperienceIllustration className="absolute inset-0" />
            </div>
            <div className="mt-5 space-y-3">
              <p className={eyebrow}>Book. Show up. Unwind.</p>
              <h1 className={headline}>Your time. Your sauna.</h1>
              <p className={bodyText}>
                Book a private sauna session on your schedule. Own a sauna? Set your hours and start earning.
              </p>
            </div>
            <div className="mt-6 space-y-5">
              <Progress step={1} />
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => go(0)} className={quietButton}>
                  Back
                </button>
                <button type="button" onClick={() => go(2)} className={primaryButton}>
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {header(
              <button type="button" onClick={() => go(1)} className="inline-flex h-11 items-center px-1 text-[15px] text-[#7A6355]">
                Back
              </button>
            )}
            <div className="relative -mx-6 min-h-0 flex-1">
              <ChooseIllustration className="absolute inset-0" />
            </div>
            <div className="mt-3 space-y-2">
              <p className={eyebrow}>How you&apos;ll use thrml</p>
              <h1 className={headline}>What brings you to thrml?</h1>
              <p className="text-[15px] leading-relaxed text-[#7A6355]">
                Choose how you&apos;d like to get started. You can always do both later.
              </p>
            </div>
            <div className="mt-4 space-y-2.5" role="radiogroup" aria-label="How you'll use thrml">
              {ROLES.map((role) => {
                const selected = intent === role.id
                return (
                  <button
                    key={role.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onIntent(role.id)}
                    className={cn(
                      "flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl px-[18px] py-3 text-left transition-colors",
                      selected ? "border-[1.5px] border-[#1A1410] bg-white" : "border border-[#DDD4C8] bg-transparent"
                    )}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[16px] font-medium text-[#1A1410]">{role.title}</span>
                      <span className="text-[14px] text-[#7A6355]">{role.body}</span>
                    </span>
                    {selected ? (
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="shrink-0">
                        <circle cx="11" cy="11" r="11" fill="#1A1410" />
                        <path d="M6.5 11.2 L9.6 14.2 L15.5 8.2" stroke="#F7F3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="shrink-0">
                        <circle cx="11" cy="11" r="10" stroke="#DDD4C8" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-5 space-y-1">
              <button
                type="button"
                onClick={onContinue}
                disabled={!intent}
                className={cn(primaryButton, "w-full")}
              >
                Continue
              </button>
              <Action
                onClick={onLookAround}
                href="/explore"
                className="flex h-11 w-full items-center justify-center text-[15px] text-[#7A6355]"
              >
                Look around first
              </Action>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
