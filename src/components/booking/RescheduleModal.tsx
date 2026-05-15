"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Loader2 } from "lucide-react"

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

type RescheduleSlot = {
  startTime: string
  endTime: string
  label: string
}

type RescheduleModalProps = {
  bookingId: string
  listingTitle: string
  currentSessionDate: string | null
  currentStartTime: string | null
  currentEndTime: string | null
  userRole: "guest" | "host"
  onRescheduled?: () => void | Promise<void>
  trigger?: React.ReactNode
}

function defaultDateIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatCurrentSession(date: string | null, start: string | null, end: string | null) {
  if (!date) return "Current session"
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  if (!start || !end) return label
  return `${label} · ${start.slice(0, 5)}–${end.slice(0, 5)}`
}

export function RescheduleModal({
  bookingId,
  listingTitle,
  currentSessionDate,
  currentStartTime,
  currentEndTime,
  userRole,
  onRescheduled,
  trigger,
}: RescheduleModalProps) {
  const [open, setOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(currentSessionDate ?? defaultDateIso())
  const [slots, setSlots] = useState<RescheduleSlot[]>([])
  const [selected, setSelected] = useState<RescheduleSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const minDate = useMemo(() => defaultDateIso(), [])
  const maxDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 60)
    return d.toISOString().slice(0, 10)
  }, [])

  useEffect(() => {
    if (!open) return
    setSessionDate(currentSessionDate ?? defaultDateIso())
    setSelected(null)
    setError(null)
    setReason("")
  }, [open, currentSessionDate])

  useEffect(() => {
    if (!open || !sessionDate) return
    let cancelled = false
    const load = async () => {
      setLoadingSlots(true)
      setError(null)
      setSelected(null)
      try {
        const response = await fetch(
          `/api/bookings/${bookingId}/reschedule?date=${encodeURIComponent(sessionDate)}`
        )
        const payload = (await response.json().catch(() => null)) as {
          error?: string
          slots?: RescheduleSlot[]
        } | null
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to load available times")
        }
        if (!cancelled) {
          setSlots(payload?.slots ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setSlots([])
          setError(err instanceof Error ? err.message : "Unable to load times")
        }
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, bookingId, sessionDate])

  async function handleConfirm() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDate,
          startTime: selected.startTime,
          endTime: selected.endTime,
          requested_by: userRole,
          reason: reason.trim() || undefined,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to reschedule")
      }
      setOpen(false)
      await onRescheduled?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reschedule")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="rounded-xl border-[#E2D8CC] bg-white text-[#5E4E42]">
            Reschedule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule session</DialogTitle>
          <DialogDescription>
            Pick a new time for <span className="font-medium text-[#1A1410]">{listingTitle}</span>. Same duration and
            price — no extra charge.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-[#6C5B4F]">
          <CalendarDays className="mr-1.5 inline size-4 align-text-bottom" />
          {formatCurrentSession(currentSessionDate, currentStartTime, currentEndTime)}
        </p>

        <div className="space-y-2">
          <Label htmlFor="reschedule-date">New date</Label>
          <Input
            id="reschedule-date"
            type="date"
            min={minDate}
            max={maxDate}
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label>Available times</Label>
          {loadingSlots ? (
            <p className="flex items-center gap-2 text-sm text-[#7A6A5D]">
              <Loader2 className="size-4 animate-spin" />
              Loading slots…
            </p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-[#7A6A5D]">No open slots on this date. Try another day.</p>
          ) : (
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {slots.map((slot) => {
                const active =
                  selected?.startTime === slot.startTime && selected?.endTime === slot.endTime
                return (
                  <button
                    key={`${slot.startTime}-${slot.endTime}`}
                    type="button"
                    onClick={() => setSelected(slot)}
                    className={`rounded-xl border px-2 py-2 text-sm transition-colors ${
                      active
                        ? "border-[#C75B3A] bg-[#FFF4EE] text-[#8B3A20]"
                        : "border-[#E9DFD3] bg-white text-[#5E4E42] hover:border-[#D4C4B4]"
                    }`}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reschedule-reason">Note (optional)</Label>
          <Input
            id="reschedule-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={userRole === "host" ? "e.g. Equipment maintenance completed early" : "e.g. Schedule conflict"}
            className="rounded-xl"
          />
        </div>

        {userRole === "guest" ? (
          <p className="text-xs text-[#8A7769]">Guest reschedules must be made at least 24 hours before the session.</p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selected || submitting}
            className="rounded-xl bg-[#C75B3A] text-white hover:bg-[#b44f31]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Confirm new time"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
