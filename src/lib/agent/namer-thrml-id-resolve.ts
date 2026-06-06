import type { SupabaseClient } from "@supabase/supabase-js"

import type { MetaPlatformIds } from "@/lib/agent/namer-sheet-schema"

export type ThrmlLegacyIds = {
  campaignId: string
  adSetId: string
  adId: string
}

/** Map Meta platform IDs → C001 / AS001 / AD001 from paid-media tables when present. */
export async function resolveThrmlLegacyIdsFromPlatform(
  admin: SupabaseClient,
  platformIds: MetaPlatformIds
): Promise<ThrmlLegacyIds> {
  let campaignId = ""
  let adSetId = ""
  let adId = ""

  const platformCampaignId = platformIds.campaignId.trim()
  const platformAdSetId = platformIds.adSetId.trim()
  const platformAdId = platformIds.adId.trim()

  if (platformCampaignId) {
    const { data } = await admin
      .from("campaigns")
      .select("legacy_id")
      .eq("platform_campaign_id", platformCampaignId)
      .maybeSingle()
    if (typeof data?.legacy_id === "string" && data.legacy_id.trim()) {
      campaignId = data.legacy_id.trim()
    }
  }

  if (platformAdSetId) {
    const { data } = await admin
      .from("ad_sets")
      .select("legacy_id, campaign_id")
      .eq("platform_adset_id", platformAdSetId)
      .maybeSingle()
    if (typeof data?.legacy_id === "string" && data.legacy_id.trim()) {
      adSetId = data.legacy_id.trim()
    }
    if (!campaignId && data?.campaign_id) {
      const { data: camp } = await admin
        .from("campaigns")
        .select("legacy_id")
        .eq("id", data.campaign_id)
        .maybeSingle()
      if (typeof camp?.legacy_id === "string" && camp.legacy_id.trim()) {
        campaignId = camp.legacy_id.trim()
      }
    }
  }

  if (platformAdId) {
    const { data } = await admin
      .from("ads")
      .select("legacy_id, ad_set_id, campaign_id")
      .eq("platform_ad_id", platformAdId)
      .maybeSingle()
    if (typeof data?.legacy_id === "string" && data.legacy_id.trim()) {
      adId = data.legacy_id.trim()
    }
    if (!adSetId && data?.ad_set_id) {
      const { data: set } = await admin
        .from("ad_sets")
        .select("legacy_id")
        .eq("id", data.ad_set_id)
        .maybeSingle()
      if (typeof set?.legacy_id === "string" && set.legacy_id.trim()) {
        adSetId = set.legacy_id.trim()
      }
    }
    if (!campaignId && data?.campaign_id) {
      const { data: camp } = await admin
        .from("campaigns")
        .select("legacy_id")
        .eq("id", data.campaign_id)
        .maybeSingle()
      if (typeof camp?.legacy_id === "string" && camp.legacy_id.trim()) {
        campaignId = camp.legacy_id.trim()
      }
    }
  }

  return { campaignId, adSetId, adId }
}
