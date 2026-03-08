"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

type WaiverTemplate = {
  title: string
  body: string
  version: string
}

export function WaiverModal({
  open,
  listingTitle,
  serviceType,
  onAccept,
  onDecline,
}: {
  open: boolean
  listingTitle: string
  serviceType: string
  onAccept: (waiverVersion: string) => void
  onDecline: () => void
}) {
  const [template, setTemplate] = useState<WaiverTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()

    const fetchTemplate = async () => {
      setLoading(true)
      setChecked(false)

      const primary = await supabase
        .from("waiver_templates")
        .select("title, body, version")
        .eq("service_type", serviceType)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let row = primary.data

      if (!row) {
        const fallback = await supabase
          .from("waiver_templates")
          .select("title, body, version")
          .eq("service_type", "general")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        row = fallback.data
      }

      if (!cancelled) {
        setTemplate(
          row
            ? {
                title: String(row.title ?? "Assumption of Risk"),
                body: String(row.body ?? ""),
                version: String(row.version ?? "v1.0-2026-03"),
              }
            : {
                title: "Wellness Session - Assumption of Risk",
                body: "By continuing, you acknowledge that participation in wellness activities carries inherent physical risks.",
                version: "v1.0-2026-03",
              }
        )
        setLoading(false)
      }
    }

    void fetchTemplate()

    return () => {
      cancelled = true
    }
  }, [open, serviceType])

  const renderedBody = useMemo(() => {
    if (!template) return ""
    return template.body.replaceAll("{listing_title}", listingTitle)
  }, [listingTitle, template])

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{template?.title ?? "Assumption of Risk"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading waiver...</p>
        ) : (
          <>
            <div className="max-h-[220px] overflow-y-auto rounded-lg border border-[#E6DDD3] bg-[#FCFAF7] p-3 text-sm leading-relaxed text-[#2F241E]">
              <p className="whitespace-pre-line">{renderedBody}</p>
            </div>

            <label className="flex items-start gap-3 rounded-md border border-[#E6DDD3] px-3 py-2">
              <Checkbox checked={checked} onCheckedChange={(value) => setChecked(Boolean(value))} />
              <span className="text-[13px] leading-5 text-[#1A1410]">
                I have read and agree to the above Assumption of Risk, Thrml&apos;s{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                  Terms of Service
                </Link>
                ,{" "}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link href="/disclaimer" target="_blank" rel="noopener noreferrer" className="underline">
                  Disclaimers
                </Link>
                . I confirm I am physically fit to participate.
              </span>
            </label>

            <div className="space-y-2">
              <Button
                className="btn-primary w-full"
                disabled={!checked || !template}
                onClick={() => template && onAccept(template.version)}
              >
                Confirm &amp; Continue to Payment
              </Button>
              <button
                type="button"
                className="block w-full text-center text-xs text-muted-foreground underline"
                onClick={onDecline}
              >
                Decline
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
