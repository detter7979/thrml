import { requireAdmin } from "@/lib/admin-guard"

import {
  AdminAgentClient,
  type AbTestLogRow,
  type AdsetRegistryRow,
  type AgentConfigRow,
  type AgentDecisionRow,
  type CampaignRegistryRow,
  type CreativeQueueRow,
  type CreativeRegistryRow,
} from "./agent-client"

export const dynamic = "force-dynamic"

export default async function AdminAgentPage() {
  const { admin } = await requireAdmin()

  const [configsRes, decisionsRes, abTestsRes, queueRes, campaignsRes, adsetsRes, creativesRes] =
    await Promise.all([
      admin.from("agent_config").select("*").order("platform").order("goal_type"),
      admin.from("agent_decisions").select("*").order("evaluated_at", { ascending: false }).limit(200),
      admin.from("ab_test_log").select("*").order("created_at", { ascending: false }).limit(100),
      admin.from("creative_queue").select("*").order("created_at", { ascending: false }),
      admin.from("campaign_registry").select("*").order("created_at", { ascending: false }),
      admin.from("adset_registry").select("*").order("created_at", { ascending: false }),
      admin.from("creative_registry").select("*").order("created_at", { ascending: false }),
    ])

  return (
    <AdminAgentClient
      initialConfigs={(configsRes.data ?? []) as AgentConfigRow[]}
      initialDecisions={(decisionsRes.data ?? []) as AgentDecisionRow[]}
      initialAbTests={(abTestsRes.data ?? []) as AbTestLogRow[]}
      initialQueue={(queueRes.data ?? []) as CreativeQueueRow[]}
      initialCampaigns={(campaignsRes.data ?? []) as CampaignRegistryRow[]}
      initialAdsets={(adsetsRes.data ?? []) as AdsetRegistryRow[]}
      initialCreatives={(creativesRes.data ?? []) as CreativeRegistryRow[]}
    />
  )
}
