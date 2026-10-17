import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Everything in the paid media + creative loop that's waiting on a human, in one place
 * (admin Paid media → Approvals, and the daily digest email).
 */
export type ApprovalInboxItem = { id: string; label: string; detail?: string; href: string }

export type ApprovalInbox = {
  recommendations: number
  buildRecommendations: number
  briefs: ApprovalInboxItem[]
  assetsToReview: number
  assetsReadyToLaunch: number
  pausedDrafts: ApprovalInboxItem[]
  total: number
}

const CREATIVE_HREF = "/admin/agents?tab=creative"

export async function loadApprovalInbox(admin: SupabaseClient): Promise<ApprovalInbox> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [recs, builds, briefs, toReview, ready, drafts] = await Promise.all([
    admin.from("recommendations").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    admin
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING")
      .in("kind", ["CREATE_AD_SET", "ADVANCE_PHASE", "LAUNCH_TEST", "GENERATE_CREATIVE"]),
    admin
      .from("creative_briefs")
      .select("id, hypothesis, campaign_short_name, status, created_at")
      .in("status", ["pending", "briefed"])
      .is("approved_at", null)
      .neq("trigger_type", "social")
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("creative_assets").select("id", { count: "exact", head: true }).eq("status", "generated"),
    admin
      .from("creative_assets")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .is("meta_ad_id", null)
      .is("launched_at", null),
    admin
      .from("meta_executions")
      .select("id, kind, response_payload, completed_at, request_payload")
      .eq("kind", "duplicate_ad_set")
      .eq("status", "success")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(10),
  ])

  const briefItems: ApprovalInboxItem[] = (briefs.data ?? []).map((b) => ({
    id: b.id as string,
    label: `${(b.campaign_short_name as string) || "Brief"}: ${String(b.hypothesis ?? "").slice(0, 110)}`,
    detail: b.status === "pending" ? "needs expanding" : "ready for your OK",
    href: CREATIVE_HREF,
  }))

  const draftItems: ApprovalInboxItem[] = (drafts.data ?? []).map((d) => {
    const r = (d.response_payload ?? {}) as Record<string, unknown>
    const kind = ((d.request_payload ?? {}) as Record<string, unknown>).recommendation_kind
    const label =
      kind === "ADVANCE_PHASE"
        ? `Next-phase campaign ${String(r.new_campaign ?? "")} (optimizes on ${String(r.optimizes_on ?? "?")})`
        : `Audience test ad set ${String(r.legacy_id ?? r.name ?? "")}`
    const id = String(r.new_campaign_id ?? r.new_adset_id ?? d.id)
    return {
      id: d.id as string,
      label,
      detail: "paused in Meta — review and turn on in Ads Manager",
      href: `https://adsmanager.facebook.com/adsmanager/manage/${r.new_campaign_id ? "campaigns" : "adsets"}?selected_${r.new_campaign_id ? "campaign" : "adset"}_ids=${id}`,
    }
  })

  const recommendations = recs.count ?? 0
  const assetsToReview = toReview.count ?? 0
  const assetsReadyToLaunch = ready.count ?? 0
  return {
    recommendations,
    buildRecommendations: builds.count ?? 0,
    briefs: briefItems,
    assetsToReview,
    assetsReadyToLaunch,
    pausedDrafts: draftItems,
    total: recommendations + briefItems.length + assetsToReview + assetsReadyToLaunch,
  }
}
