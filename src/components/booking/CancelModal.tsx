"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatMoney } from "@/lib/cancellations"

type CancelledBy = "guest" | "host"

type BookingPreview = {
  id: string
  session_date: string | null
  start_time: string | null
  end_time: string | null
  listing_title: string | null
  service_fee: number | null
}

type RefundPreviewResponse = {
  refund_amount: number
  refund_status: string
  platform_fee: number
  policy_name: string
  policy_reminder: string
  hours_until_session: number | null
}

const guestReasons = [
  "Change of plans",
  "Schedule conflict",
  "Found alternative",
  "Health reasons",
  "Other",
]

const hostReasons = [
  "Emergency",
  "Equipment issue",
  "Property unavailable",
  "Personal reasons",
  "Other",
]

type CancelModalProps = {
  booking: BookingPreview
  userRole: CancelledBy
  onConfirm?: (params: { cancelled_by: CancelledBy; reason?: string }) => Promise<void> | void
}

function formatSessionSummary(booking: BookingPreview) {
  if (!booking.session_date) return "Session date TBD"
  const startDate = booking.start_time
    ? new Date(`${booking.session_date}T${booking.start_time}`)
    : new Date(`${booking.session_date}T12:00:00`)
  const endDate = booking.end_time
    ? new Date(`${booking.session_date}T${booking.end_time}`)
    : null
  const dateText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(startDate)
  if (!booking.start_time) return dateText
  const timeText = endDate
    ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(startDate)}-${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(endDate)}`
    : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(startDate)
  return `${dateText} · ${timeText}`
}

export function CancelModal({ booking, userRole, onConfirm }: CancelModalProps) {
  const [open, setOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [otherReason, setOtherReason] = useState("")
  const [preview, setPreview] = useState<RefundPreviewResponse | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    const fetchPreview = async () => {
      setLoadingPreview(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/bookings/${booking.id}/refund-preview?role=${encodeURIComponent(userRole)}`
        )
        const payload = (await response.json()) as RefundPreviewResponse & { error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Unable to load refund preview")
        if (active) setPreview(payload)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load refund preview")
      } finally {
        if (active) setLoadingPreview(false)
      }
    }
    void fetchPreview()
    return () => {
      active = false
    }
  }, [booking.id, open, userRole])

  const refundAmount = Number(preview?.refund_amount ?? 0)
  const platformFee = Number(preview?.platform_fee ?? booking.service_fee ?? 0)
  const selectedReason = reason === "Other" ? otherReason.trim() : reason

  const hostPenalty = useMemo(() => {
    const hours = Number(preview?.hours_until_session ?? 0)
    if (!Number.isFinite(hours) || hours <= 0) return null
    if (hours < 24) return { hours, amount: 50 }
    if (hours <= 72) return { hours, amount: 25 }
    return null
  }, [preview?.hours_until_session])

  async function handleConfirm() {
    if (userRole === "host" && !selectedReason) {
      setError("Please choose a reason before cancelling this guest booking.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (onConfirm) {
        await onConfirm({ cancelled_by: userRole, reason: selectedReason || undefined })
      } else {
        const response = await fetch(`/api/bookings/${booking.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cancelled_by: userRole,
            reason: selectedReason || undefined,
          }),
        })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Unable to cancel booking")
      }

      setOpen(false)
      setReason("")
      setOtherReason("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel booking")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-[#7C6B5E] underline-offset-2 hover:underline"
        >
          {userRole === "host" ? "Cancel guest booking" : "Cancel booking"}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {userRole === "host" ? "Cancel this guest's booking?" : "Cancel this booking?"}
          </DialogTitle>
          <DialogDescription>
            {userRole === "host"
              ? "Cancelling affects your guest's plans."
              : "Review the refund details before confirming."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-[#E8DED2] bg-[#FCF8F3] p-3">
            <p className="font-medium text-[#1A1410]">{booking.listing_title ?? "Thrml session"}</p>
            <p className="text-[#6C5B4F]">{formatSessionSummary(booking)}</p>
          </div>

          {loadingPreview ? <p className="text-[#6C5B4F]">Calculating refund preview...</p> : null}

          {preview && userRole === "guest" ? (
            <div
              className={`rounded-xl border p-3 ${
                refundAmount > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <p>
                {refundAmount > 0
                  ? `You'll receive ${formatMoney(refundAmount)} back to your original payment method within 5-10 business days.`
                  : `This booking is non-refundable based on the host's ${preview.policy_name} cancellation policy.`}
              </p>
              <p className="mt-1 text-xs text-[#6C5B4F]">
                Platform fee ({formatMoney(platformFee)}) is non-refundable.
              </p>
            </div>
          ) : null}

          {preview && userRole === "host" ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Cancelling affects your guest&apos;s plans. The guest will receive a full refund of{" "}
                {formatMoney(refundAmount)} including the platform fee.
              </div>
              {hostPenalty ? (
                <div className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-amber-900">
                  ⚠️ Cancelling within {Math.floor(hostPenalty.hours)} hours of the session will result in a{" "}
                  {formatMoney(hostPenalty.amount)} penalty applied to your next payout.
                </div>
              ) : null}
            </>
          ) : null}

          {preview ? (
            <p className="text-xs text-[#7A6A5D]">{preview.policy_reminder}</p>
          ) : null}

          <div className="space-y-2">
            <Label>
              {userRole === "host" ? "Reason (required)" : "Reason (optional)"}
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {(userRole === "host" ? hostReasons : guestReasons).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === "Other" ? (
              <Input
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                placeholder="Add details"
              />
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
            Keep booking
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={submitting || loadingPreview}
            className="bg-[#991B1B] text-white hover:bg-[#7F1D1D]"
          >
            {submitting
              ? "Cancelling..."
              : userRole === "host"
                ? "Cancel guest's booking"
                : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
