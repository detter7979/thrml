import { Button } from "@/components/ui/button"

export function GuestSelector({
  value,
  onChange,
  min = 1,
  max = 12,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-2">
      <span className="text-sm">{value} guests</span>
      <div className="flex gap-1">
        <Button size="icon-sm" variant="outline" onClick={() => onChange(Math.max(min, value - 1))}>
          -
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </Button>
      </div>
    </div>
  )
}
