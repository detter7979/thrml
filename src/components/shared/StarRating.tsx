import { Star } from "lucide-react"

export function StarRating({ value, reviewCount }: { value: number; reviewCount?: number }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <Star className="size-4 fill-current" />
      <span>{value.toFixed(1)}</span>
      {typeof reviewCount === "number" ? <span className="text-muted-foreground">({reviewCount})</span> : null}
    </div>
  )
}
