import { Button } from "@/components/ui/button"

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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
            title={slot.tooltip}
            className={`min-h-[44px] whitespace-nowrap px-2 py-2.5 text-center leading-tight ${
              slot.state === "booked" ? "bg-zinc-100 text-zinc-500 line-through" : ""
            } ${slot.state === "too_late" || slot.state === "past" ? "bg-zinc-100 text-zinc-500" : ""}`}
          >
            {slot.label}
          </Button>
        )
      })}
    </div>
  )
}
