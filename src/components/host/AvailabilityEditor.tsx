import { Input } from "@/components/ui/input"

export type AvailabilityDay = {
  day: string
  enabled: boolean
  start: string
  end: string
}

export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: AvailabilityDay[]
  onChange: (next: AvailabilityDay[]) => void
}) {
  return (
    <div className="space-y-2">
      {value.map((day, idx) => (
        <div key={day.day} className="grid grid-cols-[100px_1fr_1fr] items-center gap-2 rounded-lg border p-2">
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-sm"
            onClick={() =>
              onChange(value.map((item, itemIdx) => (itemIdx === idx ? { ...item, enabled: !item.enabled } : item)))
            }
          >
            {day.enabled ? "On" : "Off"} {day.day}
          </button>
          <Input
            type="time"
            value={day.start}
            disabled={!day.enabled}
            onChange={(event) =>
              onChange(value.map((item, itemIdx) => (itemIdx === idx ? { ...item, start: event.target.value } : item)))
            }
          />
          <Input
            type="time"
            value={day.end}
            disabled={!day.enabled}
            onChange={(event) =>
              onChange(value.map((item, itemIdx) => (itemIdx === idx ? { ...item, end: event.target.value } : item)))
            }
          />
        </div>
      ))}
    </div>
  )
}
