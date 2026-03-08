type BreakdownKey = "cleanliness" | "accuracy" | "communication" | "value"

type RatingSummaryProps = {
  avgOverall: number
  reviewCount: number
  averages: Partial<Record<BreakdownKey, number>>
  wouldRecommendPercent?: number
  starDistribution: Record<number, number>
  activeStarFilter?: number | null
  onStarFilterChange?: (stars: number | null) => void
  compact?: boolean
}

const LABELS: Array<{ key: BreakdownKey; label: string }> = [
  { key: "cleanliness", label: "Cleanliness" },
  { key: "accuracy", label: "Accuracy" },
  { key: "communication", label: "Communication" },
  { key: "value", label: "Value" },
]

export function RatingSummary({
  avgOverall,
  reviewCount,
  averages,
  wouldRecommendPercent,
  starDistribution,
  activeStarFilter = null,
  onStarFilterChange,
  compact = false,
}: RatingSummaryProps) {
  const clampedOverall = Math.max(0, Math.min(5, avgOverall))
  const starRow = "★★★★★".slice(0, Math.round(clampedOverall)).padEnd(5, "☆")

  if (compact) {
    return (
      <section className="rounded-xl border border-[#E6DDD3] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <p className="font-medium text-[#1A1410]">{clampedOverall.toFixed(2)} overall</p>
          <p className="text-[#7A6B5D]">{reviewCount} reviews</p>
        </div>
        <div className="grid gap-1.5">
          {LABELS.map((row) => {
            const value = Number(averages[row.key] ?? 0)
            const width = Math.max(0, Math.min(100, (value / 5) * 100))
            return (
              <div key={row.key} className="grid grid-cols-[108px_1fr_34px] items-center gap-2 text-xs">
                <span className="text-[#6F6054]">{row.label}</span>
                <div className="h-1 rounded-full bg-[#EDE8E2]">
                  <div className="h-full rounded-full bg-[#C75B3A]" style={{ width: `${width}%` }} />
                </div>
                <span className="text-right font-semibold text-[#3A3028]">{value ? value.toFixed(1) : "-"}</span>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[#E8DED2] bg-white p-5">
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <div>
          <p className="font-serif text-[64px] leading-none text-[#1A1410]">{clampedOverall.toFixed(2)}</p>
          <p className="mt-2 text-[20px] leading-none text-[#F5A76C]">{starRow}</p>
          <p className="mt-2 text-sm text-[#8B7A6D]">{reviewCount} reviews</p>
          {typeof wouldRecommendPercent === "number" ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">{wouldRecommendPercent}% would recommend</p>
          ) : null}
        </div>

        <div className="space-y-2.5">
          {LABELS.map((row) => {
            const value = Number(averages[row.key] ?? 0)
            const ratio = Math.max(0, Math.min(100, (value / 5) * 100))
            return (
              <div key={row.key} className="grid grid-cols-[120px_1fr_35px] items-center gap-2 text-sm">
                <span className="text-[13px] text-[#6D5E51]">{row.label}</span>
                <div className="h-1 rounded-full bg-[#EDE8E2]">
                  <div className="h-full rounded-full bg-[#C75B3A]" style={{ width: `${ratio}%` }} />
                </div>
                <span className="text-right text-[13px] font-semibold text-[#2F261F]">
                  {value ? value.toFixed(1) : "-"}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-5 space-y-1.5 border-t border-[#F0E7DD] pt-4">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = Number(starDistribution[stars] ?? 0)
          const percent = reviewCount ? (count / reviewCount) * 100 : 0
          const active = activeStarFilter === stars
          return (
            <button
              key={stars}
              type="button"
              onClick={() => onStarFilterChange?.(active ? null : stars)}
              className={`grid w-full grid-cols-[40px_1fr_34px] items-center gap-2 text-left ${
                active ? "text-[#1A1410]" : "text-[#6D5E51]"
              }`}
            >
              <span className="text-sm">{stars} ★</span>
              <div className="h-1 rounded-full bg-[#EDE8E2]">
                <div className="h-full rounded-full bg-[#C75B3A]" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-right text-xs font-medium">{count}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
