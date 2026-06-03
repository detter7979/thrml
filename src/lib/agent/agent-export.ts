import type { createAdminClient } from "@/lib/supabase/admin"

type AdminClient = ReturnType<typeof createAdminClient>

export async function exportAgentData(admin: AdminClient, goalFilter: string | null) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

  let decisionsQ = admin
    .from("agent_decisions")
    .select("*")
    .gte("evaluated_at", ninetyDaysAgo)
    .order("evaluated_at", { ascending: false })
  if (goalFilter) decisionsQ = decisionsQ.eq("goal_type", goalFilter)

  let campaignsQ = admin.from("campaign_registry").select("*").order("created_at", { ascending: false })
  if (goalFilter) campaignsQ = campaignsQ.eq("goal_type", goalFilter)

  let adsetsQ = admin.from("adset_registry").select("*").order("created_at", { ascending: false })
  if (goalFilter) adsetsQ = adsetsQ.eq("goal_type", goalFilter)

  let queueQ = admin
    .from("creative_queue")
    .select("*")
    .in("status", ["PENDING", "IN_PROGRESS"])
    .order("created_at", { ascending: false })
  if (goalFilter) queueQ = queueQ.eq("goal_type", goalFilter)

  const [campaigns, adsets, creatives, decisions, abTests, queue] = await Promise.all([
    campaignsQ,
    adsetsQ,
    admin.from("creative_registry").select("*").order("created_at", { ascending: false }),
    decisionsQ,
    admin.from("ab_test_log").select("*").order("created_at", { ascending: false }),
    queueQ,
  ])

  const { error: syncLogErr } = await admin.from("sheets_sync_log").insert({
    rows_campaigns: campaigns.data?.length ?? 0,
    rows_adsets: adsets.data?.length ?? 0,
    rows_decisions: decisions.data?.length ?? 0,
    rows_abtests: abTests.data?.length ?? 0,
    status: "ok",
  })
  if (syncLogErr) {
    /* table may not exist in all environments */
  }

  return {
    exported_at: new Date().toISOString(),
    goal_type_filter: goalFilter ?? "all",
    campaigns: campaigns.data ?? [],
    adsets: adsets.data ?? [],
    creatives: creatives.data ?? [],
    decisions: decisions.data ?? [],
    ab_tests: abTests.data ?? [],
    queue: queue.data ?? [],
  }
}
