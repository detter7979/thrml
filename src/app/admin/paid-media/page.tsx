import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"
import { createClient } from "@/lib/supabase/server"
import type { PendingRecViewRow } from "@/types/paid-media"

import { ApprovalQueueClient } from "./approval-queue-client"

export const dynamic = "force-dynamic"

function isPendingRecViewRow(row: Record<string, unknown>): row is PendingRecViewRow & Record<string, unknown> {
  return typeof row.id === "string" && typeof row.kind === "string" && typeof row.created_at === "string"
}

export default async function AdminPaidMediaPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: rawRows, error } = await supabase
    .from("v_pending_recs")
    .select("*")
    .order("created_at", { ascending: false })

  const initialRecs: PendingRecViewRow[] = (rawRows ?? [])
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .filter(isPendingRecViewRow)
    .map((row) => ({
      id: row.id,
      kind: row.kind as PendingRecViewRow["kind"],
      proposed_by: row.proposed_by as PendingRecViewRow["proposed_by"],
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      rationale: typeof row.rationale === "string" ? row.rationale : null,
      created_at: row.created_at,
      expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
      campaign_name: typeof row.campaign_name === "string" ? row.campaign_name : null,
      service: (row.service ?? null) as PendingRecViewRow["service"],
      geo: typeof row.geo === "string" ? row.geo : null,
      phase: (row.phase ?? null) as PendingRecViewRow["phase"],
      ad_set_name: typeof row.ad_set_name === "string" ? row.ad_set_name : null,
      ad_name: typeof row.ad_name === "string" ? row.ad_name : null,
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
      evidence:
        row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
          ? (row.evidence as Record<string, unknown>)
          : null,
    }))

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Paid media</h1>
          <p className="text-sm text-[#6E5B49]">Approval queue and campaign system of record.</p>
        </div>
        <Link
          href="/admin/paid-media/campaigns"
          className="rounded-full border border-[#CDBCA8] bg-white px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]"
        >
          Campaigns
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">
          Could not load pending recommendations: {error.message}. If this is a fresh deploy, apply the
          migration that grants admin SELECT on paid media tables.
        </div>
      ) : null}

      <ApprovalQueueClient initialRecs={initialRecs} initialFetchError={error?.message ?? null} />
    </div>
  )
}
