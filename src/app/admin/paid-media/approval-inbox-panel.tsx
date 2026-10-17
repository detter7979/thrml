import Link from "next/link"

import type { ApprovalInbox } from "@/lib/agent/approval-inbox"

function Stat({ label, value, href, hint }: { label: string; value: number; href: string; hint: string }) {
  return (
    <Link
      href={href}
      className={`rounded-xl border px-4 py-3 transition hover:border-[#9A4A33] ${
        value > 0 ? "border-[#E7DACA] bg-white" : "border-[#EFE6DA] bg-[#FBF8F4]"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-[#6E5B49]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${value > 0 ? "text-[#2A2118]" : "text-[#B5A593]"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-[#6E5B49]">{hint}</p>
    </Link>
  )
}

/** One view of everything waiting on you across paid media and the creative pipeline. */
export function ApprovalInboxPanel({ inbox }: { inbox: ApprovalInbox }) {
  return (
    <section className="space-y-4 rounded-2xl border border-[#E7DACA] bg-[#FCFAF7] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-[#2A2118]">Waiting on you</h2>
        <p className="text-xs text-[#6E5B49]">
          Pauses and budget changes can run on their own once auto-approve is on. Briefs, concepts, tests and new
          campaigns always wait for you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Recommendations"
          value={inbox.recommendations}
          href="#queue"
          hint={inbox.buildRecommendations ? `${inbox.buildRecommendations} tests / builds / briefs` : "below"}
        />
        <Stat label="Briefs to approve" value={inbox.briefs.length} href="/admin/agents?tab=creative" hint="Creative pipeline" />
        <Stat label="Concepts to review" value={inbox.assetsToReview} href="/admin/agents?tab=creative" hint="Generated assets" />
        <Stat label="Ready to launch" value={inbox.assetsReadyToLaunch} href="/admin/agents?tab=creative" hint="Approved, not in Meta yet" />
      </div>

      {inbox.briefs.length ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6E5B49]">Briefs</h3>
          <ul className="divide-y divide-[#EFE6DA] rounded-xl border border-[#EFE6DA] bg-white">
            {inbox.briefs.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[#2A2118]">{b.label}</span>
                <Link href={b.href} className="shrink-0 text-xs font-medium text-[#9A4A33] hover:underline">
                  {b.detail} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inbox.pausedDrafts.length ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6E5B49]">
            Built from your approvals (last 14 days, created paused)
          </h3>
          <ul className="divide-y divide-[#EFE6DA] rounded-xl border border-[#EFE6DA] bg-white">
            {inbox.pausedDrafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[#2A2118]">{d.label}</span>
                <a href={d.href} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-[#9A4A33] hover:underline">
                  Open in Ads Manager →
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
