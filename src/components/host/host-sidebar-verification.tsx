"use client"

import Link from "next/link"

import { VerifiedHostBadge } from "@/components/host/verified-host-badge"

export function HostSidebarVerification({ idVerified }: { idVerified: boolean }) {
  if (idVerified) {
    return (
      <div className="mt-1">
        <VerifiedHostBadge verified size="md" showLabel />
      </div>
    )
  }

  return (
    <p className="mt-1">
      <Link
        href="/dashboard/account#identity"
        className="text-xs font-medium text-[#8B4513] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C75B3A]/40 focus-visible:ring-offset-1"
      >
        Verify your identity
      </Link>
    </p>
  )
}
