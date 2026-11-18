import Link from "next/link"
import { ChevronRight, MessageCircle, ScrollText, Sparkles, Wallet } from "lucide-react"

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function ProfileHome({
  fullName,
  hostTools,
  earnings,
}: {
  fullName: string
  hostTools: boolean
  earnings: { thisMonth: number; allTime: number } | null
}) {
  const rows = [
    { href: "#profile", label: "Edit profile", detail: "Name, photo, phone, and bio" },
    { href: "/dashboard/messages", label: "Messages", detail: "Conversations with guests and hosts" },
    ...(hostTools
      ? [
          { href: "#house-rules", label: "House rules", detail: "What guests agree to before they book" },
          { href: "/dashboard/host/templates", label: "Message templates", detail: "Saved replies for check-in and questions" },
          { href: "/dashboard/earnings", label: "Earnings details", detail: "Payouts, sessions, and history" },
          { href: "/dashboard/bookings", label: "Bookings", detail: "Upcoming sessions at your spaces" },
          { href: "/dashboard", label: "Host home", detail: "Earnings, upcoming guests, and messages" },
          { href: "/dashboard/listings", label: "Listings", detail: "The spaces you host" },
        ]
      : [{ href: "/dashboard/bookings", label: "Bookings", detail: "Upcoming and past sessions" }]),
  ]

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[13px] font-medium tracking-[0.16em] text-[#C75B3A] uppercase">You</p>
        <h1 className="mt-1 font-serif text-4xl text-[#1A1410]">{fullName}</h1>
        <p className="mt-2 text-sm text-[#6D5E51]">
          {hostTools
            ? "Your profile, earnings, house rules, and the messages guests see."
            : "The details hosts see, and how thrml reaches you."}
        </p>
      </div>

      {hostTools && earnings ? (
        <Link href="/dashboard/earnings" className="block rounded-3xl bg-[#1A1410] p-5 text-[#F5EFE8]">
          <div className="flex items-center gap-2 text-[#E8B9A4]">
            <Wallet className="size-4" />
            <p className="text-xs font-medium tracking-[0.14em] uppercase">This month</p>
          </div>
          <p className="mt-2 font-serif text-4xl">{money(earnings.thisMonth)}</p>
          <p className="mt-1 text-sm text-white/70">All time {money(earnings.allTime)}</p>
        </Link>
      ) : null}

      <div className="overflow-hidden rounded-3xl bg-white">
        {rows.map((row, index) => (
          <Link
            key={row.href}
            href={row.href}
            className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-[#F0E8E0]" : ""}`}
          >
            {row.href === "/dashboard/messages" ? (
              <MessageCircle className="size-4 shrink-0 text-[#8B4513]" />
            ) : row.href === "#house-rules" ? (
              <ScrollText className="size-4 shrink-0 text-[#8B4513]" />
            ) : row.href === "/dashboard/listings" ? (
              <Sparkles className="size-4 shrink-0 text-[#8B4513]" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[#1A1410]">{row.label}</span>
              <span className="block text-xs text-[#7A6A5D]">{row.detail}</span>
            </span>
            <ChevronRight className="size-4 text-[#C4B6A8]" />
          </Link>
        ))}
      </div>
    </section>
  )
}
