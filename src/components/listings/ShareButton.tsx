"use client"

import { Check, Facebook, Link2, Mail, MessageCircle, MoreHorizontal, Share2 } from "lucide-react"
import { useMemo, useState, type MouseEvent } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { trackGaEvent } from "@/lib/analytics/ga"

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
  const facebookAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim()

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/listings/${listing.id}`
    return `${window.location.origin}/listings/${listing.id}`
  }, [listing.id])

  function stopCardNavigation(event: MouseEvent) {
    event.stopPropagation()
  }

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    try {
      await navigator.clipboard.writeText(shareUrl)
      trackGaEvent("share", {
        method: "copy_link",
        content_type: "listing",
        item_id: listing.id,
      })
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function handleEmail(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    trackGaEvent("share", {
      method: "email",
      content_type: "listing",
      item_id: listing.id,
    })
    const subject = encodeURIComponent("Check out this wellness space on Thrml")
    const body = encodeURIComponent(
      `I found this on Thrml and thought you might like it:\n\n${listing.title}\n${shareUrl}`
    )
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  function handleFacebook(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    trackGaEvent("share", {
      method: "facebook",
      content_type: "listing",
      item_id: listing.id,
    })
    const facebookShareUrl = facebookAppId
      ? `https://www.facebook.com/dialog/share?app_id=${encodeURIComponent(facebookAppId)}&display=popup&href=${encodeURIComponent(shareUrl)}&redirect_uri=${encodeURIComponent(shareUrl)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    window.open(
      facebookShareUrl,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function handleMessenger(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    trackGaEvent("share", {
      method: "messenger",
      content_type: "listing",
      item_id: listing.id,
    })
    const messengerShareUrl = facebookAppId
      ? `https://www.facebook.com/dialog/send?app_id=${encodeURIComponent(facebookAppId)}&link=${encodeURIComponent(shareUrl)}&redirect_uri=${encodeURIComponent(shareUrl)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    window.open(
      messengerShareUrl,
      "_blank",
      "noopener,noreferrer"
    )
  }

  async function handleNativeShare(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event)
    if (!canUseNativeShare) return
    try {
      trackGaEvent("share", {
        method: "native",
        content_type: "listing",
        item_id: listing.id,
      })
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
          <button type="button" className={rowClass} onClick={handleFacebook}>
            <Facebook className="size-4" />
            Share on Facebook
          </button>
          <button type="button" className={rowClass} onClick={handleMessenger}>
            <MessageCircle className="size-4" />
            Share on Messenger
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
