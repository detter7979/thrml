"use client"

import { Check } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const TOOLTIP_TEXT = "Government-issued ID verified through Stripe."
const ARIA_LABEL = "Verified host: government-issued ID verified through Stripe"

type VerifiedHostBadgeProps = {
  verified: boolean | null | undefined
  size?: "sm" | "md"
  showLabel?: boolean
  className?: string
}

export function VerifiedHostBadge({
  verified,
  size = "sm",
  showLabel = false,
  className,
}: VerifiedHostBadgeProps) {
  if (verified !== true) return null

  const iconWrap =
    size === "md" ? "size-5" : "size-3.5"
  const icon =
    size === "md" ? "size-2.5" : "size-2"
  const labelClass = size === "md" ? "text-xs" : "text-[11px]"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="img"
            aria-label={ARIA_LABEL}
            className={cn(
              "inline-flex shrink-0 cursor-default items-center gap-1 rounded-full align-middle",
              "text-[#6E5B4F] outline-none focus-visible:ring-2 focus-visible:ring-[#C75B3A]/40 focus-visible:ring-offset-1",
              className
            )}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full bg-[#E8E4DE] ring-1 ring-[#D4CCC2]/80",
                iconWrap
              )}
              aria-hidden
            >
              <Check className={cn(icon, "stroke-[2.5]")} />
            </span>
            {showLabel ? (
              <span className={cn(labelClass, "font-medium tracking-wide text-[#5D4D41]")}>Verified</span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent>{TOOLTIP_TEXT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
