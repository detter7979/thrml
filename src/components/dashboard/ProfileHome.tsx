import Link from "next/link"
import { Bell, ChevronRight, Landmark, MessageSquareText, ScrollText, UserRound, Wallet } from "lucide-react"

import { SignOutButton } from "@/components/auth/sign-out-button"
import { CookieSettingsLink } from "@/components/cookie-settings-link"
import { DoNotSellLink } from "@/components/do-not-sell-link"
import { AppModeSwitch } from "@/components/shared/AppModeSwitch"

type Row = { href: string; label: string; detail: string; icon: typeof UserRound }

/**
 * Top of the Profile tab: who you are, the booking/hosting switch, and a short index of the
 * settings below. Places the tab bar and sidebar already reach (Messages, Bookings, Listings,
 * Today) aren't repeated here, and earnings live on Today.
 */
export function ProfileHome({
  fullName,
  hostTools,
  hostingEnabled,
}: {
  fullName: string
  hostTools: boolean
  hostingEnabled: boolean
}) {
  const rows: Row[] = [
    { href: "#profile", label: "Personal info", detail: "Name, photo, phone, and bio", icon: UserRound },
    ...(hostingEnabled
      ? [{ href: "#identity", label: "Payouts & verification", detail: "Bank, identity, and insurance", icon: Landmark }]
      : []),
    ...(hostTools
      ? [
          { href: "#house-rules", label: "House rules", detail: "What guests agree to before they book", icon: ScrollText },
          { href: "/dashboard/host/templates", label: "Message templates", detail: "Saved replies for check-in and questions", icon: MessageSquareText },
          { href: "/dashboard/earnings", label: "Earnings", detail: "Payouts, sessions, and history", icon: Wallet },
        ]
      : []),
    { href: "#notifications", label: "Notifications", detail: "Booking alerts and emails", icon: Bell },
  ]

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[13px] font-medium tracking-[0.16em] text-[#C75B3A] uppercase">You</p>
        <h1 className="mt-1 font-serif text-4xl text-[#1A1410]">{fullName}</h1>
        <p className="mt-2 text-sm text-[#6D5E51]">
          {hostTools
            ? "Your profile, payouts, house rules, and the messages guests see."
            : "The details hosts see, and how thrml reaches you."}
        </p>
      </div>

      <AppModeSwitch canHost={hostTools} />


      <div className="overflow-hidden rounded-3xl bg-white">
        {rows.map((row, index) => {
          const Icon = row.icon
          return (
            <Link
              key={row.href}
              href={row.href}
              className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-[#F0E8E0]" : ""}`}
            >
              <Icon className="size-4 shrink-0 text-[#A8472B]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[#1A1410]">{row.label}</span>
                <span className="block text-xs text-[#7A6A5D]">{row.detail}</span>
              </span>
              <ChevronRight className="size-4 text-[#C4B6A8]" />
            </Link>
          )
        })}
      </div>

      <SignOutButton />

      <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs text-[#7A6A5D] md:hidden">
        <Link href="/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/consumer-health-data">Health data</Link>
        <Link href="/copyright">Copyright</Link>
        <Link href="/support">Support</Link>
        <CookieSettingsLink className="text-[#7A6A5D]" />
        <DoNotSellLink compact className="text-[#7A6A5D]" />
      </div>
    </section>
  )
}
