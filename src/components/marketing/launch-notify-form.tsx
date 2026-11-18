"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { Button } from "@/components/ui/button"
import { trackGaEvent } from "@/lib/analytics/ga"

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LaunchNotifyFormProps = {
  /** Newsletter source recorded on the subscriber row. */
  source: "launch_waitlist" | "guest_lp"
  /** "dark" for the espresso sections, "light" for cream backgrounds. */
  tone?: "dark" | "light"
  buttonLabel?: string
  successMessage?: string
  finePrint?: string
}

function readUtm(key: string): string | undefined {
  if (typeof window === "undefined") return undefined
  return new URLSearchParams(window.location.search).get(key) ?? undefined
}

/**
 * Email capture for the guest launch list. Saves to newsletter_subscribers with launch_notify on,
 * so the launch-day announcement goes to everyone who asked.
 */
export function LaunchNotifyForm({
  source,
  tone = "dark",
  buttonLabel = "Notify me",
  successMessage = "You're on the list. We'll email you the day bookings open.",
  finePrint = "One email when bookings open. Unsubscribe anytime.",
}: LaunchNotifyFormProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [error, setError] = useState<string | null>(null)

  const dark = tone === "dark"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status !== "idle") return
    const formData = new FormData(event.currentTarget)
    const website = typeof formData.get("website") === "string" ? (formData.get("website") as string).trim() : ""
    const normalized = email.trim().toLowerCase()
    if (!VALID_EMAIL_REGEX.test(normalized)) {
      setError("Please enter a valid email address.")
      inputRef.current?.focus()
      return
    }

    setError(null)
    setStatus("loading")
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized,
          website,
          source,
          launch_notify: true,
          signup_path: window.location.pathname,
          utm_source: readUtm("utm_source"),
          utm_campaign: readUtm("utm_campaign"),
        }),
      })
      if (!response.ok) throw new Error("Subscribe failed")
      const result = (await response.json().catch(() => null)) as { lead_event_id?: string } | null

      trackGaEvent("launch_list_signup", { source })
      // Same event id as the server's CAPI copy so Meta counts it once.
      if (result?.lead_event_id) {
        trackMetaEvent(
          "Lead",
          { content_name: "launch_list_signup", content_category: source },
          { eventId: result.lead_event_id, sendServer: false }
        )
      }
      setStatus("success")
      setEmail("")
    } catch {
      setStatus("idle")
      setError("Something went wrong. Please try again.")
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className={
          dark
            ? "flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-100/10 px-4 py-3 text-[#D5F3E1]"
            : "flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
        }
      >
        <CheckCircle2 className={dark ? "size-5 text-emerald-300" : "size-5 text-emerald-600"} />
        <p className="text-sm">{successMessage}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-2" noValidate>
      {/* Honeypot: hidden from people, filled by bots */}
      <input
        type="text"
        name="website"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: "none" }}
      />
      <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (error) setError(null)
          }}
          placeholder="Email"
          disabled={status === "loading"}
          className={`h-10 w-full rounded-lg border px-3 text-sm text-[#1A1410] outline-none placeholder:text-[#8E8176] focus:border-[#C75B3A] disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-0 sm:flex-1 ${
            dark ? "border-white/20 bg-white" : "border-warm-200 bg-white"
          }`}
        />
        <Button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#C75B3A] px-4 text-sm font-medium text-white hover:bg-[#B45033] disabled:cursor-not-allowed disabled:opacity-80 sm:w-auto"
        >
          {status === "loading" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </span>
          ) : (
            buttonLabel
          )}
        </Button>
      </div>
      {error ? (
        <p className={`mt-3 px-1 text-sm ${dark ? "text-[#F1B8A8]" : "text-[#A3402A]"}`}>{error}</p>
      ) : (
        <p className={`mt-3 px-1 text-xs ${dark ? "text-white/50" : "text-warm-600"}`}>{finePrint}</p>
      )}
    </form>
  )
}
