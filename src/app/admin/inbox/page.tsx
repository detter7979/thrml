import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"

export default async function AdminInboxOverviewPage() {
  const { admin } = await requireAdmin()

  const [activeDisputesRes, pendingHumanRes, draftsRes] = await Promise.all([
    admin
      .from("support_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "pending_agent", "pending_human"]),
    admin
      .from("support_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_human"),
    admin
      .from("inbox_drafts")
      .select("id", { count: "exact", head: true })
      .eq("approved", false)
      .is("sent_at", null),
  ])

  const activeDisputes = activeDisputesRes.count ?? 0
  const pendingHuman = pendingHumanRes.count ?? 0
  const draftReplies = draftsRes.count ?? 0

  const cards = [
    {
      href: "/admin/inbox/messages",
      title: "Messages & support tickets",
      body: "Host and guest threads; switch to support tickets for escalations.",
    },
    {
      href: "/admin/inbox/disputes",
      title: "Disputes",
      body: `Queue: ${activeDisputes} active (${pendingHuman} need a human). Policy-backed classifications; auto-refunds only when confidence is high and human review is not required.`,
    },
    {
      href: "/admin/inbox/drafts",
      title: "Email drafts",
      body: `${draftReplies} unsent agent drafts awaiting approval.`,
    },
  ] as const

  return (
    <div className="p-4 md:p-6">
      <ul className="mx-auto grid max-w-3xl gap-4">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-[#DCCDBA] bg-[#FCF8F3] p-5 transition hover:border-[#9A4A33]/50 hover:bg-[#F7EFE4]"
            >
              <h2 className="font-medium text-[#2A2118]">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5B4A3A]">{c.body}</p>
              <p className="mt-3 text-xs font-medium text-[#9A4A33]">Open tab →</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
