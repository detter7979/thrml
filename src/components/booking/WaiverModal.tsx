"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatServiceType } from "@/lib/constants/service-types"
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
  const [failSafe, setFailSafe] = useState(false)
  const [loading, setLoading] = useState(true)
  const [serviceTypeLabel, setServiceTypeLabel] = useState("")
  const [checked, setChecked] = useState(false)
  const [medicalChecked, setMedicalChecked] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()

    const fetchTemplateAndLabel = async () => {
      setLoading(true)
      setFailSafe(false)
      setTemplate(null)
      setChecked(false)
      setMedicalChecked(false)

      const serviceTypeKey = (serviceType || "general").trim() || "general"

      const [stResult, primaryResult, generalResult] = await Promise.all([
        supabase.from("service_types").select("display_name").eq("id", serviceTypeKey).maybeSingle(),
        supabase
          .from("waiver_templates")
          .select("title, body, version")
          .eq("service_type", serviceTypeKey)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("waiver_templates")
          .select("title, body, version")
          .eq("service_type", "general")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (cancelled) return

      const labelFromDb =
        typeof stResult.data?.display_name === "string" ? stResult.data.display_name.trim() : ""
      setServiceTypeLabel(labelFromDb || formatServiceType(serviceTypeKey))

      let row = primaryResult.data
      if (!row) {
        row = generalResult.data
      }

      if (!row) {
        setFailSafe(true)
        setTemplate(null)
      } else {
        const version = String(row.version ?? "").trim()
        if (!version) {
          setFailSafe(true)
          setTemplate(null)
        } else {
          setFailSafe(false)
          setTemplate({
            title: String(row.title ?? "Assumption of Risk"),
            body: String(row.body ?? ""),
            version,
          })
        }
      }

      setLoading(false)
    }

    void fetchTemplateAndLabel()

    return () => {
      cancelled = true
    }
  }, [open, serviceType])

  const renderedBody = useMemo(() => {
    if (!template) return ""
    return template.body.replaceAll("{listing_title}", listingTitle)
  }, [listingTitle, template])

  const canAccept =
    Boolean(template && !failSafe && template.version && checked && medicalChecked)

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
          <DialogTitle>
            {failSafe
              ? "Waiver unavailable"
              : template?.title ?? "Assumption of Risk"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading waiver...</p>
        ) : failSafe ? (
          <>
            <div
              role="alert"
              className="rounded-lg border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-[#2F241E] shadow-sm"
            >
              <p className="font-semibold text-destructive">
                Safety Warning: Detailed waiver for this service type is missing. Please contact support.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                You can reach our team from the{" "}
                <Link href="/support" className="font-medium text-destructive underline underline-offset-2">
                  support page
                </Link>{" "}
                — we will help before you continue.
              </p>
            </div>

            <div className="space-y-2">
              <Button className="btn-primary w-full" disabled type="button">
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

            <div className="space-y-2 rounded-md border border-[#E6DDD3] bg-[#FAFAF8] px-3 py-3">
              <p className="text-sm font-medium text-[#1A1410]">Medical Acknowledgment</p>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={medicalChecked}
                  onCheckedChange={(value) => setMedicalChecked(Boolean(value))}
                />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  I confirm I have reviewed the specific risks for {serviceTypeLabel} including thermal stress and
                  physical exertion.
                  <span className="ml-1 text-destructive">*</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Button
                className="btn-primary w-full"
                disabled={!canAccept}
                onClick={() => {
                  if (template?.version) onAccept(template.version)
                }}
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
