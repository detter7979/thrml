import { StarRating } from "@/components/reviews/StarRating"

export function GuestReputationBadge({
  avgRating,
  reviewCount,
  compact = false,
}: {
  avgRating: number
  reviewCount: number
  compact?: boolean
}) {
  if (reviewCount <= 0) {
    return (
      <span className={`inline-flex items-center rounded-full bg-[#F3EDE6] px-2 py-0.5 text-[#7A6A5D] ${compact ? "text-[11px]" : "text-xs"}`}>
        New guest
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#FBF8F4] px-2 py-0.5 text-[#5E4E42] ${compact ? "text-[11px]" : "text-xs"}`}>
      <StarRating value={avgRating} size={compact ? 12 : 14} />
      <span>
        {avgRating.toFixed(1)} · {reviewCount} rating{reviewCount === 1 ? "" : "s"}
      </span>
    </span>
  )
}
