"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Flag } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  REPORT_REASONS,
  REPORT_TARGET_LABEL,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/moderation/reasons"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetType: ReportTargetType
  targetId: string
  /** For reports about a person from inside a conversation. */
  conversationId?: string
  /** e.g. "Maya" when reporting a person. */
  targetName?: string
}

type Phase = "form" | "sending" | "sent" | "signin"

/**
 * Report a listing, review, message or person. Shared by every screen that shows content other
 * people wrote, so reports look and behave the same everywhere.
 */
export function ReportDialog({ open, onOpenChange, targetType, targetId, conversationId, targetName }: Props) {
  const pathname = usePathname()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [phase, setPhase] = useState<Phase>("form")
  const [error, setError] = useState<string | null>(null)

  const noun = targetType === "user" && targetName ? targetName : `this ${REPORT_TARGET_LABEL[targetType]}`

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      // Reset after the close animation.
      window.setTimeout(() => {
        setReason(null)
        setDetails("")
        setPhase("form")
        setError(null)
      }, 200)
    }
  }

  async function submit() {
    if (!reason || phase === "sending") return
    setPhase("sending")
    setError(null)
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || undefined, conversationId }),
      })
      if (response.status === 401) {
        setPhase("signin")
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not send your report.")
      setPhase("sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your report.")
      setPhase("form")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-[#E7DED3] bg-[#FCFAF7] p-6">
        {phase === "sent" ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FFE8DC]">
              <Flag className="size-5 text-[#C75B3A]" aria-hidden />
            </div>
            <DialogTitle className="font-serif text-2xl font-normal text-[#1A1410]">Thanks for telling us</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#7A6355]">
              Our team reviews every report within 24 hours. If something breaks our community rules, we&apos;ll
              remove it and act on the account. We won&apos;t tell them who reported it.
            </DialogDescription>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="btn-primary h-11 w-full rounded-full text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : phase === "signin" ? (
          <div className="space-y-4 py-2 text-center">
            <DialogTitle className="font-serif text-2xl font-normal text-[#1A1410]">Sign in to report</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#7A6355]">
              We ask for an account so we can follow up on reports.
            </DialogDescription>
            <Link
              href={`/login?next=${encodeURIComponent(pathname ?? "/")}`}
              className="btn-primary inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium"
            >
              Log in
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <DialogTitle className="font-serif text-2xl font-normal text-[#1A1410]">Report {noun}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-[#7A6355]">
                What&apos;s wrong? Reports are private.
              </DialogDescription>
            </div>

            <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((item) => {
                const active = reason === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setReason(item.value)}
                    className={`min-h-10 rounded-full border px-3.5 text-sm transition-colors ${
                      active
                        ? "border-[#C75B3A] bg-[#FFE8DC] text-[#A8472B]"
                        : "border-[#DDD4C8] bg-white text-[#5E4E42] hover:border-[#C9B9A8]"
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A7A6D]">Anything else? (optional)</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, 1000))}
                rows={3}
                placeholder="Add details that help us understand what happened"
                className="w-full rounded-xl border border-[#E7DED3] bg-white p-3 text-sm text-[#1A1410] outline-none placeholder:text-[#A89888] focus:border-[#C75B3A]"
              />
            </label>

            {targetType === "user" || targetType === "message" ? (
              <p className="text-xs leading-5 text-[#8A7A6D]">
                If someone is in danger, call 911 first.
              </p>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-11 flex-1 rounded-full border border-[#E7DED3] bg-white text-sm font-medium text-[#1A1410] hover:bg-[#FCFAF7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!reason || phase === "sending"}
                className="btn-primary h-11 flex-1 rounded-full text-sm font-medium disabled:opacity-50"
              >
                {phase === "sending" ? "Sending..." : "Send report"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Small "Report" text link that opens the dialog. */
export function ReportLink({
  label = "Report",
  className = "",
  ...dialogProps
}: Omit<Props, "open" | "onOpenChange"> & { label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-xs text-[#8A7A6D] underline-offset-2 hover:text-[#5E4E42] hover:underline ${className}`}
      >
        <Flag className="size-3" aria-hidden />
        {label}
      </button>
      <ReportDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  )
}
