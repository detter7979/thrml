import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"
import { createClient } from "@/lib/supabase/server"
import type { Campaign, PhaseT, StatusT } from "@/types/paid-media"

export const dynamic = "force-dynamic"

const PHASES: PhaseT[] = ["P1", "P2", "P3"]
const STATUSES: StatusT[] = ["DRAFT", "TEST", "SCALE", "PAUSED", "KILLED", "ARCHIVED"]

function statusBadgeClass(status: StatusT): string {
  switch (status) {
    case "DRAFT":
      return "border-[#DCCDBA] bg-[#EDE8E0] text-[#5B4A3A]"
    case "TEST":
      return "border-[#88A8C8] bg-[#D8E5F0] text-[#2A4A6E]"
    case "SCALE":
      return "border-[#8BAF7A] bg-[#DDE7D5] text-[#2D4A22]"
    case "PAUSED":
      return "border-[#D4A82A]/45 bg-[#FDF6E3] text-[#8D6A3D]"
    case "KILLED":
      return "border-[#C75B3A]/50 bg-[#F9E5DD] text-[#9A4A33]"
    case "ARCHIVED":
      return "border-[#8B7562] bg-[#4A3F36] text-[#EDE3D4]"
    default:
      return "border-[#DCCDBA] bg-[#EDE8E0] text-[#5B4A3A]"
  }
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—"
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function parseCampaign(row: Record<string, unknown>): Campaign | null {
  if (typeof row.id !== "string" || typeof row.name !== "string") return null
  return row as unknown as Campaign
}

function chipHref(next: { phase?: string | null; status?: string | null }): string {
  const params = new URLSearchParams()
  const phase = next.phase
  const status = next.status
  if (phase && phase !== "all") params.set("phase", phase)
  if (status && status !== "all") params.set("status", status)
  const qs = params.toString()
  return qs ? `/admin/paid-media/campaigns?${qs}` : "/admin/paid-media/campaigns"
}

export default async function PaidMediaCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; status?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const phaseFilter =
    typeof query.phase === "string" && (PHASES as string[]).includes(query.phase) ? (query.phase as PhaseT) : null
  const statusFilter =
    typeof query.status === "string" && (STATUSES as string[]).includes(query.status)
      ? (query.status as StatusT)
      : null

  const supabase = await createClient()
  const { data: rawRows, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("phase", { ascending: true })
    .order("persona", { ascending: true })
    .order("daily_budget_usd", { ascending: false, nullsFirst: false })

  const allCampaigns = (rawRows ?? [])
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map(parseCampaign)
    .filter((c): c is Campaign => c !== null)

  const statusCounts = new Map<StatusT, number>()
  for (const s of STATUSES) statusCounts.set(s, 0)
  let spendTestScale = 0
  for (const c of allCampaigns) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1)
    if (c.status === "TEST" || c.status === "SCALE") {
      spendTestScale += Number(c.daily_budget_usd ?? 0)
    }
  }

  const filtered = allCampaigns.filter((c) => {
    if (phaseFilter && c.phase !== phaseFilter) return false
    if (statusFilter && c.status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Campaigns</h1>
          <p className="text-sm text-[#6E5B49]">System of record — filter by phase and status.</p>
        </div>
        <Link
          href="/admin/paid-media"
          className="rounded-full border border-[#CDBCA8] bg-white px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]"
        >
          Approval queue
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">
          Could not load campaigns: {error.message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9A4A33]">Snapshot</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#2A2118]">
          <div>
            <span className="text-[#6E5B49]">Total </span>
            <span className="font-serif text-xl">{allCampaigns.length}</span>
          </div>
          <div className="hidden h-8 w-px bg-[#DCCDBA] sm:block" aria-hidden />
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <span key={s} className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs">
                <span className="text-[#6E5B49]">{s}:</span>{" "}
                <span className="font-medium">{statusCounts.get(s) ?? 0}</span>
              </span>
            ))}
          </div>
          <div className="hidden h-8 w-px bg-[#DCCDBA] sm:block" aria-hidden />
          <div>
            <span className="text-[#6E5B49]">Daily budget (TEST + SCALE) </span>
            <span className="font-serif text-xl">{money(spendTestScale)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-[#6E5B49]">Phase</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={chipHref({ phase: null, status: statusFilter ?? undefined })}
            className={`rounded-full border px-3 py-1 text-xs ${
              !phaseFilter ? "border-[#9A4A33]/50 bg-[#E8DCCB] text-[#2A2118]" : "border-[#CDBCA8] bg-white text-[#2A2118] hover:bg-[#F3EADD]"
            }`}
          >
            All
          </Link>
          {PHASES.map((p) => (
            <Link
              key={p}
              href={chipHref({ phase: p, status: statusFilter ?? undefined })}
              className={`rounded-full border px-3 py-1 text-xs ${
                phaseFilter === p
                  ? "border-[#9A4A33]/50 bg-[#E8DCCB] text-[#2A2118]"
                  : "border-[#CDBCA8] bg-white text-[#2A2118] hover:bg-[#F3EADD]"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-[#6E5B49]">Status</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={chipHref({ phase: phaseFilter ?? undefined, status: null })}
            className={`rounded-full border px-3 py-1 text-xs ${
              !statusFilter ? "border-[#9A4A33]/50 bg-[#E8DCCB] text-[#2A2118]" : "border-[#CDBCA8] bg-white text-[#2A2118] hover:bg-[#F3EADD]"
            }`}
          >
            All
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={chipHref({ phase: phaseFilter ?? undefined, status: s })}
              className={`rounded-full border px-3 py-1 text-xs ${
                statusFilter === s
                  ? "border-[#9A4A33]/50 bg-[#E8DCCB] text-[#2A2118]"
                  : "border-[#CDBCA8] bg-white text-[#2A2118] hover:bg-[#F3EADD]"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7DACA] text-xs uppercase tracking-wide text-[#6E5B49]">
              <th className="px-3 py-2 font-medium">legacy_id</th>
              <th className="px-3 py-2 font-medium">name</th>
              <th className="px-3 py-2 font-medium">phase</th>
              <th className="px-3 py-2 font-medium">persona / service / geo</th>
              <th className="px-3 py-2 font-medium">daily_budget_usd</th>
              <th className="px-3 py-2 font-medium">status</th>
              <th className="px-3 py-2 font-medium">platform_campaign_id</th>
              <th className="px-3 py-2 font-medium">actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#6E5B49]">
                  No campaigns match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-[#E7DACA] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#5B4A3A]">
                    {c.legacy_id ?? "—"}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-[#2A2118]">
                    <span className="line-clamp-2">{c.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#2A2118]">{c.phase}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#6E5B49]">
                    {c.persona} · {c.service} · {c.geo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#2A2118]">{money(c.daily_budget_usd)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(c.status)}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-xs text-[#5B4A3A]">
                    {c.platform_campaign_id ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link
                      href={`/admin/paid-media/campaigns/${c.id}`}
                      className="text-[#9A4A33] underline-offset-2 hover:underline"
                    >
                      {c.status === "DRAFT" ? "Launch" : "View"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
