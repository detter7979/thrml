import type { SupabaseClient } from "@supabase/supabase-js"

import { callAgentJson } from "@/lib/agent/claude"

/**
 * Organic social post generation. Used by the nightly agent-social cron and the
 * on-demand "Generate" control in /admin. Posts are stored in creative_briefs
 * with trigger_type = "social" so they share the creative pipeline's storage
 * without entering the paid-ad approval/launch flow.
 */

import {
  SOCIAL_PILLARS, SOCIAL_PLATFORMS, SOCIAL_STATUS, isSocialPillar, isSocialPlatform, todaysPillar, isScheduledPostDay,
  type SocialPillar, type SocialPlatformKey, type SocialTriggerData,
} from "@/lib/agent/social-constants"

export { SOCIAL_PILLARS, SOCIAL_PLATFORMS, SOCIAL_STATUS, isSocialPillar, isSocialPlatform, todaysPillar, isScheduledPostDay }
export type { SocialPillar, SocialPlatformKey, SocialTriggerData } from "@/lib/agent/social-constants"

type SocialDraft = {
  caption: string
  hook: string
  visual_concept: string
  cta: string
  hashtags: string[]
}

async function pickSpotlightListing(admin: SupabaseClient) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: recent } = await admin
    .from("creative_briefs")
    .select("trigger_data")
    .eq("trigger_type", "social")
    .gte("created_at", since)
  const recentIds = new Set(
    (recent ?? [])
      .map((r) => (r.trigger_data as Partial<SocialTriggerData> | null)?.listing_id)
      .filter(Boolean)
  )

  const { data: listings, error } = await admin
    .from("listings")
    .select("id, title, city, state, location_city, location_state, price_solo, service_type, fixed_session_minutes, min_duration_override_minutes")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) console.error("[social-generator] listing lookup failed", error.message)

  return (listings ?? []).find((l) => !recentIds.has(l.id)) ?? listings?.[0] ?? null
}

function buildPrompt(opts: {
  pillar: SocialPillar
  platformLabel: string
  listingContext: string
  direction?: string
}) {
  const month = new Date().toLocaleString("en-US", { month: "long", timeZone: "America/Los_Angeles" })
  return `Generate one social post for thrml.

CONTENT PILLAR: ${opts.pillar}
PLATFORM: ${opts.platformLabel}
MONTH: ${month} (use seasonal context if relevant)${opts.listingContext}${
    opts.direction ? `\n\nEXTRA DIRECTION FROM THE FOUNDER: ${opts.direction}` : ""
  }

Return a JSON object with exactly these fields:
{
  "caption": "the full post caption (max 150 words for IG/TikTok; for an X thread, up to 3 tweets of 280 chars separated by blank lines)",
  "hook": "the first line that stops the scroll",
  "visual_concept": "1-2 sentences describing what to film or shoot",
  "cta": "Book at usethrml.com or Link in bio",
  "hashtags": ["3 to 5 relevant hashtags, without the # sign"]
}`
}

export type GenerateSocialResult = {
  pillar: SocialPillar
  created: { id: string; platform: SocialPlatformKey }[]
  failed: { platform: SocialPlatformKey; reason: string }[]
}

export async function generateSocialPosts(
  admin: SupabaseClient,
  opts: {
    source: SocialTriggerData["source"]
    pillar?: SocialPillar
    platforms?: SocialPlatformKey[]
    direction?: string
    /** Respect the posting calendar (cron) or generate whatever was asked for (admin). */
    respectSchedule?: boolean
  }
): Promise<GenerateSocialResult> {
  const pillar = opts.pillar ?? todaysPillar()
  const today = new Date().toISOString().slice(0, 10)
  const wanted = SOCIAL_PLATFORMS.filter(
    (p) =>
      (!opts.platforms?.length || opts.platforms.includes(p.key)) &&
      (!opts.respectSchedule || isScheduledPostDay(p.key))
  )

  let listingContext = ""
  let listingId: string | null = null
  if (pillar === "host_spotlight") {
    const listing = await pickSpotlightListing(admin)
    if (listing) {
      listingId = listing.id
      const city = listing.city || listing.location_city || "Seattle"
      const state = listing.state || listing.location_state || "WA"
      const duration = listing.fixed_session_minutes ?? listing.min_duration_override_minutes ?? 60
      listingContext = `\n\nFEATURED LISTING FOR HOST SPOTLIGHT:\nTitle: ${listing.title}\nLocation: ${city}, ${state}\nPrice: $${listing.price_solo}\nService: ${listing.service_type}\nSession length: ${duration} min`
    }
  }

  const result: GenerateSocialResult = { pillar, created: [], failed: [] }

  for (const platform of wanted) {
    const draft = await callAgentJson<SocialDraft>({
      skill: "social",
      prompt: buildPrompt({ pillar, platformLabel: platform.label, listingContext, direction: opts.direction }),
      maxTokens: 2000,
    })
    if (!draft?.caption) {
      result.failed.push({ platform: platform.key, reason: "Claude returned no usable post (see [agent/claude] log)" })
      continue
    }

    const hashtags = (Array.isArray(draft.hashtags) ? draft.hashtags : [])
      .map((h) => String(h).replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 5)

    const triggerData: SocialTriggerData = {
      source: opts.source,
      platform: platform.key,
      pillar,
      hashtags,
      listing_id: listingId,
      generated_for: today,
    }

    const { data, error } = await admin
      .from("creative_briefs")
      .insert({
        trigger_type: "social",
        trigger_data: triggerData,
        status: SOCIAL_STATUS.draft,
        hook: draft.hook,
        format: platform.format,
        visual_direction: draft.visual_concept,
        copy_primary: draft.caption,
        cta: draft.cta,
        target_audience: "guest",
        rationale: `${platform.label} · pillar: ${pillar}`,
        created_by: opts.source === "admin" ? "admin" : "agent",
      })
      .select("id")
      .single()

    if (error || !data) {
      console.error("[social-generator] insert failed", platform.key, error?.message)
      result.failed.push({ platform: platform.key, reason: error?.message ?? "insert failed" })
      continue
    }
    result.created.push({ id: data.id, platform: platform.key })
  }

  return result
}

/** Caption + hashtags as they should appear when published. */
export function formatSocialCaption(brief: { copy_primary: string | null; trigger_data: unknown }) {
  const tags = ((brief.trigger_data as Partial<SocialTriggerData> | null)?.hashtags ?? [])
    .map((t) => `#${t}`)
    .join(" ")
  return [brief.copy_primary?.trim(), tags].filter(Boolean).join("\n\n")
}
