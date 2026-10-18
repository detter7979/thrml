import { Button } from "@/components/ui/button"

/** "14:00" → "2:00 PM" */
function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map((p) => Number(p))
  const hour = Number.isFinite(h) ? h : 0
  const minute = Number.isFinite(m) ? m : 0
  const suffix = hour >= 12 ? "PM" : "AM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`
}

/**
 * Time slots as a compact grid. Each slot shows the start time on top and the end time
 * underneath, so a full "10:00 AM – 12:00 PM" range never gets cut off on a phone.
 */
export function TimeSlotPicker({
  slots,
  selectedStartTime,
  onChange,
}: {
  slots: Array<{
    startTime: string
    endTime: string
    label: string
    state: "available" | "selected" | "booked" | "too_late" | "past"
    tooltip?: string
  }>
  selectedStartTime: string | null
  onChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((slot) => {
        const selected = slot.state === "selected" || selectedStartTime === slot.startTime
        const disabled = slot.state === "booked" || slot.state === "too_late" || slot.state === "past"
        return (
          <Button
            key={`${slot.startTime}-${slot.endTime}`}
            type="button"
            variant={selected ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange(slot.startTime)}
            title={slot.tooltip ?? slot.label}
            aria-label={slot.label}
            aria-pressed={selected}
            className={`flex h-auto min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center leading-tight ${
              slot.state === "booked" ? "bg-zinc-100 text-zinc-500 line-through" : ""
            } ${slot.state === "too_late" || slot.state === "past" ? "bg-zinc-100 text-zinc-500" : ""}`}
          >
            <span className="whitespace-nowrap text-sm font-semibold">{formatTime(slot.startTime)}</span>
            <span className={`whitespace-nowrap text-[11px] font-normal ${selected ? "text-white/80" : "text-muted-foreground"}`}>
              to {formatTime(slot.endTime)}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
