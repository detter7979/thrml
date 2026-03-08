"use client"

import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

type StarRatingProps = {
  value: number
  onChange?: (value: number) => void
  onHoverChange?: (value: number | null) => void
  count?: number
  size?: number
  className?: string
  interactive?: boolean
  activeColorClassName?: string
  inactiveColorClassName?: string
}

export function StarRating({
  value,
  onChange,
  onHoverChange,
  count = 5,
  size = 22,
  className,
  interactive = false,
  activeColorClassName = "text-[#F5A76C]",
  inactiveColorClassName = "text-[#DDD4C8]",
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Array.from({ length: count }, (_, index) => {
        const star = index + 1
        const filled = value >= star
        const icon = (
          <Star
            style={{ width: size, height: size }}
            className={cn(filled ? `${activeColorClassName} fill-current` : inactiveColorClassName)}
          />
        )

        if (!interactive) {
          return (
            <span key={star} aria-hidden="true">
              {icon}
            </span>
          )
        }

        return (
          <button
            key={star}
            type="button"
            onMouseEnter={() => onHoverChange?.(star)}
            onMouseLeave={() => onHoverChange?.(null)}
            onFocus={() => onHoverChange?.(star)}
            onBlur={() => onHoverChange?.(null)}
            onClick={() => onChange?.(star)}
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            className="transition-transform hover:scale-105 focus-visible:outline-none"
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}
