import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getDurationOptions } from "@/lib/pricing"

export function DurationSelector({
  minMins,
  maxMins,
  increment,
  serviceType,
  selectedMinutes,
  onChange,
}: {
  minMins: number
  maxMins: number
  increment: number
  serviceType: string
  selectedMinutes: number
  onChange: (minutes: number) => void
}) {
  const safeMinMins = Math.max(30, minMins)
  const options = getDurationOptions(safeMinMins, Math.max(safeMinMins, maxMins), increment)
  const isSingleFixed = minMins === maxMins
  const useSelect = (serviceType === "float_tank" || serviceType === "hyperbaric") && options.length > 5

  if (isSingleFixed) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Duration</p>
        <div className="rounded-lg border border-[#E4D8CB] bg-[#FCF8F2] px-3 py-2 text-sm text-[#5B4D42]">
          {options[0]?.label ?? `${minMins}m`} session
        </div>
        {minMins > 30 ? <p className="text-xs text-muted-foreground">Minimum session: {minMins} min</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Duration</p>
      {useSelect ? (
        <Select value={String(selectedMinutes)} onValueChange={(value) => onChange(Number(value))}>
          <SelectTrigger className="h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-none">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option.minutes} value={String(option.minutes)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => (
            <Button
              key={option.minutes}
              type="button"
              variant={selectedMinutes === option.minutes ? "default" : "outline"}
              onClick={() => onChange(option.minutes)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      {minMins > 30 ? <p className="text-xs text-muted-foreground">Minimum session: {minMins} min</p> : null}
    </div>
  )
}
