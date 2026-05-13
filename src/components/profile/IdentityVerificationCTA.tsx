"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export type IdentityUiStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "requires_input"
  | "canceled"
  | "failed"
  | null
  | undefined

type Props = {
  status: IdentityUiStatus
  verified: boolean
  verifiedAt: string | null
  /** When true, use compact copy (e.g. host onboarding soft prompt). */
  compact?: boolean
}

function normalizeStatus(status: IdentityUiStatus, verified: boolean): IdentityUiStatus {
  if (verified) return "verified"
  if (!status) return "not_started"
  return status
}

export function IdentityVerificationCTA({ status, verified, verifiedAt, compact }: Props) {
  const router = useRouter()
  const [s, setS] = useState(normalizeStatus(status, verified))
  const [at, setAt] = useState(verifiedAt)
  const [starting, setStarting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshFromServer = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      const res = await fetch("/api/account/identity/status", { credentials: "include" })
      const data = (await res.json()) as {
        status?: string
        verified?: boolean
        verifiedAt?: string | null
      }
      if (!res.ok) {
        setError(
          typeof data === "object" && data && "error" in data
            ? String((data as { error?: string }).error)
            : "Could not load status"
        )
        return
      }
      setS(normalizeStatus(data.status as IdentityUiStatus, Boolean(data.verified)))
      setAt(data.verifiedAt ?? null)
      router.refresh()
    } catch {
      setError("Network error")
    } finally {
      setChecking(false)
    }
  }, [router])

  useEffect(() => {
    setS(normalizeStatus(status, verified))
    setAt(verifiedAt)
  }, [status, verified, verifiedAt])

  const startVerification = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/account/identity/start", { method: "POST", credentials: "include" })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start verification")
        return
      }
      window.location.href = data.url
    } catch {
      setError("Network error")
    } finally {
      setStarting(false)
    }
  }

  const effective = s ?? "not_started"
  const verifiedDate =
    at && !Number.isNaN(Date.parse(at))
      ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null

  if (effective === "verified") {
    return (
      <section
        className={`rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-5 shadow-sm ${compact ? "mb-4" : ""}`}
      >
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 size-6 shrink-0 text-[#166534]" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-[#14532D]">Identity verified{verifiedDate ? ` on ${verifiedDate}` : ""}</p>
            <p className="text-sm text-[#166534]/90">
              Visible as a trust badge on your listings.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (effective === "pending") {
    return (
      <section className={`rounded-2xl border border-[#E6DDD3] bg-white p-5 shadow-sm ${compact ? "mb-4" : ""}`}>
        <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">IDENTITY</h2>
        <p className="mt-2 text-sm text-[#1A1410]">
          We&apos;re processing your verification. This usually takes a minute.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 border-[#CDBCA8]"
          disabled={checking}
          onClick={() => void refreshFromServer()}
        >
          {checking ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Checking…
            </>
          ) : (
            "Check status"
          )}
        </Button>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </section>
    )
  }

  if (effective === "requires_input" || effective === "failed") {
    return (
      <section
        className={`rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 shadow-sm ${compact ? "mb-4" : ""}`}
      >
        <h2 className="text-sm font-medium tracking-wide text-[#991B1B]">IDENTITY</h2>
        <p className="mt-2 text-sm text-[#7F1D1D]">We need a bit more — please try again.</p>
        <Button type="button" className="mt-3 bg-[#B45309] hover:bg-[#9A3412]" disabled={starting} onClick={() => void startVerification()}>
          {starting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Starting…
            </>
          ) : (
            "Retry verification"
          )}
        </Button>
        {error ? <p className="mt-2 text-xs text-[#991B1B]">{error}</p> : null}
      </section>
    )
  }

  if (effective === "canceled") {
    return (
      <section className={`rounded-2xl border border-[#E6DDD3] bg-[#FCFAF7] p-5 shadow-sm ${compact ? "mb-4" : ""}`}>
        <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">IDENTITY</h2>
        <p className="mt-2 text-sm text-[#5D4D41]">You started a verification but didn&apos;t finish.</p>
        <Button type="button" className="btn-primary mt-3" disabled={starting} onClick={() => void startVerification()}>
          {starting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Starting…
            </>
          ) : (
            "Continue verification"
          )}
        </Button>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </section>
    )
  }

  /* not_started */
  return (
    <section className={`rounded-2xl border border-[#E6DDD3] bg-white p-5 shadow-sm ${compact ? "mb-4" : ""}`}>
      <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">IDENTITY</h2>
      <p className="mt-2 text-lg font-semibold text-[#1A1410]">
        {compact ? "Optional: verify your identity" : "Verify your identity"}
      </p>
      <p className="mt-1 text-sm text-[#5D4D41]">
        Verified hosts get a trust badge on their listings and book ~3x more often.
        {compact ? " You can skip this and finish your listing first." : ""}
      </p>
      <Button type="button" className="btn-primary mt-4" disabled={starting} onClick={() => void startVerification()}>
        {starting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Redirecting…
          </>
        ) : (
          "Start verification"
        )}
      </Button>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
