"use client"

import Link from "next/link"
import { CalendarDays, Heart, MessageCircle, Settings, Sparkles } from "lucide-react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { trackGaEvent } from "@/lib/analytics/ga"
import { trackBecomeHostClick } from "@/lib/tracking/google-ads"

type GuestOverviewPageProps = {
  canHost: boolean
}

export function GuestOverviewPage({ canHost }: GuestOverviewPageProps) {
  const primaryActions = [
    {
      href: "/dashboard/bookings",
      label: "Bookings",
      description: "Review upcoming sessions and booking history.",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/messages",
      label: "Messages",
      description: "Reply to hosts and keep plans coordinated.",
      icon: MessageCircle,
    },
    {
      href: "/dashboard/saved",
      label: "Saved spaces",
      description: "Revisit favorites and shortlist your next session.",
      icon: Heart,
    },
    {
      href: "/dashboard/account",
      label: "Account",
      description: "Update profile details and preferences.",
      icon: Settings,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-2xl bg-white p-5">
        <p className="text-xs font-semibold tracking-wide text-[#8B4513] uppercase">Overview</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#1A1410]">Welcome back</h1>
        <p className="mt-1 text-sm text-[#6D5E51]">
          Everything you need is one tap away. Use this hub to jump into bookings, messages, saved spaces, and account settings.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {primaryActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-2xl border border-[#EADFD4] bg-white p-4 transition hover:border-[#DDC9B8] hover:bg-[#FFFBF7]"
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-[#8B4513]" />
                <span className="text-base font-semibold text-[#1A1410]">{action.label}</span>
              </div>
              <p className="mt-2 text-sm text-[#6D5E51]">{action.description}</p>
            </Link>
          )
        })}
      </section>

      {!canHost ? (
        <section className="rounded-2xl border border-[#EADFD4] bg-[#FCF7F2] p-4">
          <div className="flex items-center gap-2 text-[#8B4513]">
            <Sparkles className="size-4" />
            <p className="text-sm font-semibold">Become a host</p>
          </div>
          <p className="mt-1 text-sm text-[#6D5E51]">
            Share your wellness space and start accepting bookings.
          </p>
          <Link
            href="/become-a-host"
            className="mt-3 inline-flex text-sm font-medium text-[#8B4513] hover:underline"
            onClick={() => {
              trackBecomeHostClick("/become-a-host", "guest_dashboard")
              trackMetaEvent(
                "become_host_click",
                {
                  content_name: "become_a_host",
                  source: "guest_dashboard",
                },
                { custom: true }
              )
              trackGaEvent("become_host_click", {
                source: "guest_dashboard",
                destination: "/become-a-host",
              })
            }}
          >
            Start hosting →
          </Link>
        </section>
      ) : null}
    </div>
  )
}
