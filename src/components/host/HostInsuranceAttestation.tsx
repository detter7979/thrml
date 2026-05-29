"use client"

import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  INSURANCE_ATTESTATION_HELPER,
  INSURANCE_ATTESTATION_LABEL,
} from "@/lib/host/insurance-attestation"

type HostInsuranceAttestationProps = {
  attested: boolean
  attestedAt?: string | null
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string | null
  showAccountLink?: boolean
}

export function HostInsuranceAttestation({
  attested,
  attestedAt,
  checked,
  onCheckedChange,
  error,
  showAccountLink = false,
}: HostInsuranceAttestationProps) {
  if (attested) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-emerald-900">Insurance attestation on file</p>
            {attestedAt ? (
              <p className="text-xs text-emerald-800">
                Confirmed on {new Date(attestedAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E5E0D8] px-3 py-3">
        <Checkbox
          checked={checked}
          className="mt-0.5 border-[#D9CBB8] data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 data-[state=checked]:text-white"
          onCheckedChange={(value) => onCheckedChange(Boolean(value))}
        />
        <span className="text-sm leading-relaxed">{INSURANCE_ATTESTATION_LABEL}</span>
      </label>
      <p className="text-xs text-muted-foreground">{INSURANCE_ATTESTATION_HELPER}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {showAccountLink ? (
        <p className="text-xs text-muted-foreground">
          You can also complete this in{" "}
          <Link href="/dashboard/account#insurance-attestation" className="text-brand-600 underline-offset-2 hover:underline">
            account settings
          </Link>
          .
        </p>
      ) : null}
    </div>
  )
}
