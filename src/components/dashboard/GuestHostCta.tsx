"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { trackGaEvent } from "@/lib/analytics/ga"
import { trackBecomeHostClick } from "@/lib/tracking/google-ads"

export function GuestHostCta() {
  return (
    <section className="rounded-2xl border border-[#EADFD4] bg-[#FCF7F2] p-4">
      <div className="flex items-center gap-2 text-[#8B4513]">
        <Sparkles className="size-4" />
        <p className="text-sm font-semibold">Become a host</p>
      </div>
      <p className="mt-1 text-sm text-[#6D5E51]">Share your sauna for the hours you are not using it.</p>
      <Link
        href="/become-a-host"
        className="mt-3 inline-flex text-sm font-medium text-[#8B4513] hover:underline"
        onClick={() => {
          trackBecomeHostClick("/become-a-host", "guest_dashboard")
          trackMetaEvent(
            "become_host_click",
            { content_name: "become_a_host", source: "guest_dashboard" },
            { custom: true }
          )
          trackGaEvent("become_host_click", {
            source: "guest_dashboard",
            destination: "/become-a-host",
          })
        }}
      >
        Start hosting
      </Link>
    </section>
  )
}
