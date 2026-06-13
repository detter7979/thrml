"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type DeleteAccountClientProps = {
  deletionRequestedAt: string | null
  userEmail: string
}

export function DeleteAccountClient({ deletionRequestedAt, userEmail }: DeleteAccountClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(Boolean(deletionRequestedAt))

  const graceEndsAt = deletionRequestedAt
    ? new Date(new Date(deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null

  async function handleRequestDeletion() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/account/delete-request", { method: "POST" })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Request failed")
      setConfirmed(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelDeletion() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/account/cancel-deletion", { method: "POST" })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Cancel failed")
      setConfirmed(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 md:px-8">
      <h1 className="font-serif text-3xl text-[#1A1410]">Delete account</h1>
      <p className="mt-2 text-sm text-[#5F5148]">Signed in as {userEmail}</p>

      {confirmed && graceEndsAt ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-[#E8DDD6] bg-white p-6">
          <p className="text-sm leading-relaxed text-[#2F241E]">
            Your account is scheduled for deletion on{" "}
            <strong>
              {graceEndsAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            . You can cancel anytime before then.
          </p>
          <p className="text-xs leading-relaxed text-[#5F5148]">
            Booking and transaction records are retained up to 7 years per our Privacy Policy. Legal acceptance
            records are retained as required. Your profile will be anonymized after the grace period.
          </p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={loading}
            onClick={() => void handleCancelDeletion()}
          >
            Cancel deletion request
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-[#E8DDD6] bg-white p-6">
          <p className="text-sm leading-relaxed text-[#2F241E]">
            Requesting deletion starts a <strong>30-day grace period</strong>. We will send a confirmation email to{" "}
            {userEmail}. You may cancel during the grace period.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[#5F5148]">
            <li>Profile name, email, phone, and avatar are anonymized after 30 days</li>
            <li>Bookings and transactions are retained for legal compliance (user_id preserved)</li>
            <li>Legal acceptance records are retained</li>
          </ul>
          <Button
            type="button"
            className="rounded-full bg-[#C4623A] text-white hover:bg-[#b05530]"
            disabled={loading}
            onClick={() => void handleRequestDeletion()}
          >
            Request account deletion
          </Button>
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <p className="mt-8 text-sm text-[#5F5148]">
        <Link href="/dashboard/account" className="text-[#C4623A] underline hover:text-[#b05530]">
          Back to account settings
        </Link>
      </p>
    </div>
  )
}
