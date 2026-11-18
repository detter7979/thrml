"use client"

import Link from "next/link"
import { useState, useSyncExternalStore } from "react"
import { X } from "lucide-react"

import { LaunchNotifyForm } from "@/components/marketing/launch-notify-form"
import { trackGaEvent } from "@/lib/analytics/ga"
import { guestLaunchLabel, isGuestPreLaunch } from "@/lib/launch-config"

/**
 * Shown when a search returns no listings. Before launch it says plainly that bookings
 * haven't opened yet (never implying there is inventory to book), takes launch-day emails,
 * and points sauna owners to hosting. After launch it keeps the "widen your search" action.
 */
export function ExploreEmptyState({ onExpandRadius }: { onExpandRadius: () => void }) {
  if (isGuestPreLaunch()) {
    return (
      <div className="rounded-2xl bg-white p-6 text-left md:p-8">
        <p className="text-[12px] font-medium tracking-[0.16em] text-[#A8472B] uppercase">Coming soon</p>
        <p className="mt-2 font-serif text-2xl text-[#1A1410]">Private saunas open {guestLaunchLabel()}.</p>
        <p className="mt-2 text-sm leading-relaxed text-[#7A6355]">
          Our first Seattle hosts are getting set up now. Leave your email and we&apos;ll let you know the day
          booking opens.
        </p>
        <div className="mt-4">
          <LaunchNotifyForm source="launch_waitlist" tone="light" buttonLabel="Notify me" />
        </div>
        <p className="mt-5 border-t border-[#EDE8E2] pt-4 text-sm text-[#7A6355]">
          Have a sauna?{" "}
          <Link href="/become-a-host" className="font-medium text-[#1A1410] underline underline-offset-4">
            Become a host
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white p-8 text-center">
      <p className="font-serif text-2xl">No spaces found in this area</p>
      <button
        type="button"
        className="mt-3 rounded-full bg-[#C75B3A] px-4 py-2 text-sm text-white"
        onClick={onExpandRadius}
      >
        Expand search radius
      </button>
    </div>
  )
}

const HOST_PROMPT_DISMISSED_KEY = "thrml.exploreHostPrompt.dismissed"

/** For people who picked "A little of both" in onboarding: a quiet way into hosting. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(HOST_PROMPT_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

const noopSubscribe = () => () => {}

export function ExploreHostPrompt({ show }: { show: boolean }) {
  // Read storage only on the client; the server render treats the prompt as dismissed.
  const storedDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true)
  const [dismissedNow, setDismissedNow] = useState(false)

  if (!show || storedDismissed || dismissedNow) return null

  function dismiss() {
    setDismissedNow(true)
    try {
      window.localStorage.setItem(HOST_PROMPT_DISMISSED_KEY, "1")
    } catch {
      // Storage can be unavailable (private mode); hiding for this visit is enough.
    }
  }

  return (
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#DDD4C8] bg-[#FFE8DC]/60 px-4 py-3 md:mx-6">
      <p className="text-sm text-[#1A1410]">
        Have a sauna?{" "}
        <Link
          href="/become-a-host"
          onClick={() => trackGaEvent("explore_host_prompt_click", { source: "onboarding_both" })}
          className="font-medium underline underline-offset-4"
        >
          Become a host
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#7A6355]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
