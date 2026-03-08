"use client"

import { Check, Facebook, Link2, Mail, MessageCircle, MoreHorizontal, Share2 } from "lucide-react"
import { useMemo, useState, type MouseEvent } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type ShareButtonProps = {
  listing: {
    id: string
    title: string
    service_type?: string | null
  }
  variant?: "card" | "detail"
  className?: string
}

export function ShareButton({ listing, variant = "detail", className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const canUseNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/listing/${listing.id}`
    return `${window.location.origin}/listing/${listing.id}`
  }, [listing.id])

  function stopCardNavigation(event: MouseEvent) {
    event.stopPropagation()
  }

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function handleEmail(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    const subject = encodeURIComponent("Check out this wellness space on Thrml")
    const body = encodeURIComponent(
      `I found this on Thrml and thought you might like it:\n\n${listing.title}\n${shareUrl}`
    )
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  function handleX(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    const text = encodeURIComponent(`Just found this on @ThrmlApp — ${listing.title}`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener,noreferrer")
  }

  function handleWhatsApp(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    const text = encodeURIComponent(`Check out this wellness space on Thrml: ${shareUrl}`)
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer")
  }

  function handleFacebook(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  async function handleNativeShare(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    if (!canUseNativeShare) return
    try {
      await navigator.share({
        title: listing.title,
        url: shareUrl,
      })
    } catch {
      // User cancelled or browser rejected.
    }
  }

  const trigger =
    variant === "card" ? (
      <button
        type="button"
        onClick={(event) => stopCardNavigation(event)}
        className={`inline-flex size-11 items-center justify-center rounded-full bg-[rgba(255,255,255,0.85)] backdrop-blur-[4px] transition ${className ?? ""}`}
        aria-label="Share listing"
      >
        <Share2 className="size-[18px] text-[#555]" />
      </button>
    ) : (
      <button
        type="button"
        className={`inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[#4F4035] ${className ?? ""}`}
        aria-label="Share listing"
      >
        <Share2 className="size-4" />
        Share
      </button>
    )

  const rowClass =
    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[#3F332A] transition hover:bg-[#F8F4EF]"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-[220px] p-2">
        <p className="px-2 pb-1 text-[13px] text-muted-foreground">Share this space</p>
        <div className="space-y-0.5">
          <button type="button" className={rowClass} onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button type="button" className={rowClass} onClick={handleEmail}>
            <Mail className="size-4" />
            Email
          </button>
          <button type="button" className={rowClass} onClick={handleX}>
            <span className="inline-block w-4 text-center text-sm font-semibold">X</span>
            Post on X (Twitter)
          </button>
          <button type="button" className={rowClass} onClick={handleWhatsApp}>
            <MessageCircle className="size-4" />
            Share on WhatsApp
          </button>
          <button type="button" className={rowClass} onClick={handleFacebook}>
            <Facebook className="size-4" />
            Share on Facebook
          </button>
          {canUseNativeShare ? (
            <button type="button" className={rowClass} onClick={handleNativeShare}>
              <MoreHorizontal className="size-4" />
              More options
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
