import { NextRequest, NextResponse } from "next/server"

import { fetchMarketingObjectStatus } from "@/lib/agent/meta-api"
import { requireAdminApi } from "@/lib/admin-guard"

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const [campaigns, adsets, creatives] = await Promise.all([
    admin!.from("campaign_registry").select("*").order("created_at", { ascending: false }),
    admin!.from("adset_registry").select("*").order("created_at", { ascending: false }),
    admin!.from("creative_registry").select("*").order("created_at", { ascending: false }),
  ])

  if (campaigns.error) return NextResponse.json({ error: campaigns.error.message }, { status: 500 })
  if (adsets.error) return NextResponse.json({ error: adsets.error.message }, { status: 500 })
  if (creatives.error) return NextResponse.json({ error: creatives.error.message }, { status: 500 })

  return NextResponse.json({
    campaigns: campaigns.data ?? [],
    adsets: adsets.data ?? [],
    creatives: creatives.data ?? [],
  })
}

type RegistryPost = {
  platform?: string
  entity_type?: string
  data?: Record<string, unknown>
}

function creativePlatformId(d: Record<string, unknown>) {
  const raw =
    (typeof d.platform_creative_id === "string" && d.platform_creative_id) ||
    (typeof d.creative_id === "string" && d.creative_id) ||
    (typeof d.ad_id === "string" && d.ad_id) ||
    ""
  return raw.trim()
}

export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => null)) as RegistryPost | null
  if (!body?.platform || !body.data) {
    return NextResponse.json({ error: "Expected { platform, data }" }, { status: 400 })
  }

  const d = body.data
  const goalType =
    typeof d.goal_type === "string" && d.goal_type === "host" ? "host" : "guest"
  const funnelStage = typeof d.funnel_stage === "string" ? d.funnel_stage : null
  const campaignType = typeof d.campaign_type === "string" ? d.campaign_type : null

  const creativeOnly =
    d.creative_only === true ||
    body.entity_type === "creative" ||
    d.register_mode === "creative_only"

  if (creativeOnly) {
    const adsetRegistryId = typeof d.adset_registry_id === "string" ? d.adset_registry_id.trim() : ""
    const pid = creativePlatformId(d)
    if (!adsetRegistryId || !pid) {
      return NextResponse.json(
        { error: "Creative-only register requires adset_registry_id and platform_creative_id (or creative_id)" },
        { status: 400 }
      )
    }

    const { data: parentAdset, error: adErr } = await admin!
      .from("adset_registry")
      .select("id, platform")
      .eq("id", adsetRegistryId)
      .maybeSingle()

    if (adErr || !parentAdset) {
      return NextResponse.json({ error: "Ad set not found" }, { status: 404 })
    }
    if (parentAdset.platform !== body.platform) {
      return NextResponse.json({ error: "Ad set platform does not match request platform" }, { status: 400 })
    }

    const creativeName =
      (typeof d.creative_name === "string" && d.creative_name.trim()) ||
      (typeof d.name === "string" && d.name.trim()) ||
      `Creative ${pid}`

    const { data: creative, error: crErr } = await admin!
      .from("creative_registry")
      .upsert(
        {
          adset_registry_id: adsetRegistryId,
          platform: body.platform,
          platform_id: pid,
          creative_name: creativeName,
          concept: typeof d.concept === "string" ? d.concept : null,
          format: typeof d.format === "string" ? d.format : null,
          ratio: typeof d.ratio === "string" ? d.ratio : null,
          cta: typeof d.cta === "string" ? d.cta : null,
          copy_variant: typeof d.copy_variant === "string" ? d.copy_variant : null,
          landing_page: typeof d.landing_page === "string" ? d.landing_page : null,
          status: typeof d.status === "string" ? d.status : "ACTIVE",
          agent_managed: d.agent_managed === false ? false : true,
        },
        { onConflict: "platform,platform_id" }
      )
      .select("*")
      .single()

    if (crErr || !creative) {
      return NextResponse.json({ error: crErr?.message ?? "Creative upsert failed" }, { status: 500 })
    }

    return NextResponse.json({ campaign: null, adset: null, creative })
  }

  const displayName =
    (typeof d.display_name === "string" && d.display_name) ||
    (typeof d.displayName === "string" && d.displayName) ||
    `${body.platform}-${Date.now()}`

  const campaignPlatformIdRaw =
    (typeof d.platform_campaign_id === "string" && d.platform_campaign_id) ||
    (typeof d.campaign_id === "string" && d.campaign_id) ||
    ""
  const campaignPlatformId = campaignPlatformIdRaw.trim() || `pending-${crypto.randomUUID()}`

  const objective = typeof d.objective === "string" ? d.objective : null
  const audType =
    (typeof d.audience_type === "string" && d.audience_type) ||
    (typeof d.aud_type === "string" && d.aud_type) ||
    null
  const market = typeof d.market === "string" ? d.market : null
  const description = typeof d.description === "string" ? d.description : null

  const now = new Date().toISOString()
  const campaignPayload = {
    platform: body.platform,
    platform_id: campaignPlatformId,
    campaign_name: displayName,
    objective,
    aud_type: audType,
    market,
    status: "ACTIVE" as string,
    agent_managed: true,
    updated_at: now,
    goal_type: goalType,
    campaign_type: campaignType,
  }

  const { data: campaign, error: campErr } = await admin!
    .from("campaign_registry")
    .upsert(campaignPayload, { onConflict: "platform,platform_id" })
    .select("*")
    .single()

  if (campErr || !campaign) {
    return NextResponse.json({ error: campErr?.message ?? "Campaign upsert failed" }, { status: 500 })
  }

  let campaignRow = campaign
  if (
    body.platform === "meta" &&
    campaignPlatformId &&
    !campaignPlatformId.startsWith("pending-") &&
    process.env.META_MARKETING_API_TOKEN
  ) {
    const live = await fetchMarketingObjectStatus(campaignPlatformId)
    if (live) {
      const { data: updated } = await admin!
        .from("campaign_registry")
        .update({ status: live, updated_at: new Date().toISOString() })
        .eq("id", campaign.id)
        .select("*")
        .single()
      if (updated) campaignRow = updated
    }
  }

  const adsetPlatformIdRaw =
    (typeof d.platform_adset_id === "string" && d.platform_adset_id) ||
    (typeof d.adset_id === "string" && d.adset_id) ||
    ""
  const adsetPlatformId = adsetPlatformIdRaw.trim()

  let adsetRow = null
  if (adsetPlatformId) {
    const { data: adset, error: adsetErr } = await admin!
      .from("adset_registry")
      .upsert(
        {
          campaign_registry_id: campaign.id,
          platform: body.platform,
          platform_id: adsetPlatformId,
          adset_name: typeof d.adset_name === "string" ? d.adset_name : `${displayName} · ad set`,
          aud_type: audType,
          audience_desc: description,
          market,
          status: "ACTIVE",
          agent_managed: true,
          updated_at: now,
          goal_type: goalType,
          funnel_stage: funnelStage,
        },
        { onConflict: "platform,platform_id" }
      )
      .select("*")
      .single()

    if (adsetErr) {
      return NextResponse.json({ error: adsetErr.message }, { status: 500 })
    }
    adsetRow = adset
  }

  let creativeRow = null
  const crPid = creativePlatformId(d)
  if (crPid) {
    let parentAdsetId: string | null = adsetRow?.id ?? null
    if (!parentAdsetId && typeof d.adset_registry_id === "string" && d.adset_registry_id.trim()) {
      parentAdsetId = d.adset_registry_id.trim()
    }
    if (!parentAdsetId && typeof d.link_adset_platform_id === "string" && d.link_adset_platform_id.trim()) {
      const linkId = d.link_adset_platform_id.trim()
      const { data: found } = await admin!
        .from("adset_registry")
        .select("id")
        .eq("platform", body.platform)
        .eq("platform_id", linkId)
        .maybeSingle()
      parentAdsetId = found?.id ?? null
    }

    if (!parentAdsetId) {
      return NextResponse.json(
        {
          error:
            "Creative platform ID was provided but no parent ad set: include platform ad set ID in this form, adset_registry_id, or link_adset_platform_id matching an existing ad set",
        },
        { status: 400 }
      )
    }

    const { data: parentCheck } = await admin!
      .from("adset_registry")
      .select("id, platform")
      .eq("id", parentAdsetId)
      .maybeSingle()
    if (!parentCheck || parentCheck.platform !== body.platform) {
      return NextResponse.json({ error: "Invalid ad set parent for creative" }, { status: 400 })
    }

    const creativeName =
      (typeof d.creative_name === "string" && d.creative_name.trim()) ||
      (typeof d.name === "string" && d.name.trim()) ||
      `${displayName} · creative`

    const { data: creative, error: crErr } = await admin!
      .from("creative_registry")
      .upsert(
        {
          adset_registry_id: parentAdsetId,
          platform: body.platform,
          platform_id: crPid,
          creative_name: creativeName,
          concept: typeof d.concept === "string" ? d.concept : null,
          format: typeof d.format === "string" ? d.format : null,
          ratio: typeof d.ratio === "string" ? d.ratio : null,
          cta: typeof d.cta === "string" ? d.cta : null,
          copy_variant: typeof d.copy_variant === "string" ? d.copy_variant : null,
          landing_page: typeof d.landing_page === "string" ? d.landing_page : null,
          status: typeof d.status === "string" ? d.status : "ACTIVE",
          agent_managed: d.agent_managed === false ? false : true,
        },
        { onConflict: "platform,platform_id" }
      )
      .select("*")
      .single()

    if (crErr) {
      return NextResponse.json({ error: crErr.message }, { status: 500 })
    }
    creativeRow = creative
  }

  return NextResponse.json({ campaign: campaignRow, adset: adsetRow, creative: creativeRow })
}
