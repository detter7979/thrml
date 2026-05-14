import Link from "next/link"
import { notFound } from "next/navigation"

import { requireAdmin } from "@/lib/admin-guard"
import { createClient } from "@/lib/supabase/server"
import type { Ad, AdSet, Campaign, StatusT } from "@/types/paid-media"

import { LaunchFormClient } from "./launch-form-client"

export const dynamic = "force-dynamic"

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

function parseCampaign(row: Record<string, unknown>): Campaign | null {
  if (typeof row.id !== "string" || typeof row.name !== "string") return null
  return row as unknown as Campaign
}

function parseAdSet(row: Record<string, unknown>): AdSet | null {
  if (typeof row.id !== "string" || typeof row.campaign_id !== "string") return null
  return row as unknown as AdSet
}

function parseAd(row: Record<string, unknown>): Ad | null {
  if (typeof row.id !== "string" || typeof row.campaign_id !== "string" || typeof row.ad_set_id !== "string")
    return null
  return row as unknown as Ad
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—"
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default async function PaidMediaCampaignLaunchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: rawCampaign, error: cErr } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle()

  if (cErr) {
    return (
      <div className="space-y-6 px-6 py-8">
        <p className="text-sm text-[#9A4A33]">Could not load campaign: {cErr.message}</p>
        <Link
          href="/admin/paid-media/campaigns"
          className="inline-block rounded-full border border-[#CDBCA8] bg-white px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]"
        >
          Back to campaigns
        </Link>
      </div>
    )
  }

  const campaign = rawCampaign && parseCampaign(rawCampaign as Record<string, unknown>)
  if (!campaign) notFound()

  const { data: rawSets, error: sErr } = await supabase
    .from("ad_sets")
    .select("*")
    .eq("campaign_id", id)
    .order("legacy_id", { ascending: true })

  const { data: rawAds, error: aErr } = await supabase
    .from("ads")
    .select("*")
    .eq("campaign_id", id)
    .order("legacy_id", { ascending: true })

  const adSets = (rawSets ?? [])
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map(parseAdSet)
    .filter((a): a is AdSet => a !== null)

  const ads = (rawAds ?? [])
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map(parseAd)
    .filter((a): a is Ad => a !== null)

  const fetchError = sErr?.message ?? aErr?.message ?? null

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link
            href="/admin/paid-media/campaigns"
            className="text-sm text-[#9A4A33] underline-offset-2 hover:underline"
          >
            ← Campaigns
          </Link>
          <h1 className="font-serif text-3xl text-[#2A2118]">Launch campaign</h1>
          <p className="font-mono text-xs text-[#6E5B49]">
            legacy_id: <span className="select-all">{campaign.legacy_id ?? "—"}</span>
          </p>
          <p className="select-all break-all text-xl font-semibold text-[#2A2118]">{campaign.name}</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.phase}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.persona}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.service}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.geo}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.funnel}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {campaign.event}
            </span>
            <span className="rounded-full border border-[#E7DACA] bg-white px-2 py-0.5 text-xs text-[#2A2118]">
              {money(campaign.daily_budget_usd)} / day
            </span>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(campaign.status)}`}
            >
              {campaign.status}
            </span>
          </div>
        </div>
      </div>

      {fetchError ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">
          Warning loading children: {fetchError}
        </div>
      ) : null}

      <LaunchFormClient campaign={campaign} adSets={adSets} ads={ads} />
    </div>
  )
}
