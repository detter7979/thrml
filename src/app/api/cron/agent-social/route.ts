import { NextRequest, NextResponse } from "next/server"

import { callAgentJson } from "@/lib/agent/claude"
import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

const PILLARS = ["education", "social_proof", "host_spotlight", "offer_cta"] as const
type Pillar = typeof PILLARS[number]

type SocialBrief = {
  platform: string
  format: string
  pillar: Pillar
  caption: string
  hook: string
  visual_concept: string
  cta: string
  hashtags: string[]
}

// Rotate pillar by day of week: Mon/Fri=education, Tue/Sat=social_proof, Wed=host_spotlight, Thu/Sun=offer_cta
function todaysPillar(): Pillar {
  const day = new Date().getUTCDay()
  const map: Record<number, Pillar> = {
    0: "offer_cta", 1: "education", 2: "social_proof",
    3: "host_spotlight", 4: "education", 5: "social_proof", 6: "offer_cta",
  }
  return map[day] ?? "education"
}

function isPostDay(platform: string): boolean {
  const day = new Date().getUTCDay()
  // Instagram static: Mon, Wed, Fri (1, 3, 5)
  if (platform === "instagram_static") return [1, 3, 5].includes(day)
  // All others: daily
  return true
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "social", status: "running" })
    .select("id").single()
  const runId = runRow?.id ?? null

  try {
    const pillar = todaysPillar()
    const today = new Date().toISOString().slice(0, 10)
    let listingContext = ""

    // For host_spotlight, pick a listing not featured in last 7 days
    if (pillar === "host_spotlight") {
      const { data: recentSpotlights } = await admin
        .from("creative_queue")
        .select("target_adset_id")
        .eq("queue_type", "social_static")
        .eq("concept", "host_spotlight")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      const recentIds = new Set((recentSpotlights ?? []).map(r => r.target_adset_id).filter(Boolean))

      const { data: listings } = await admin
        .from("listings")
        .select("id, title, city, state, price_solo, service_type, session_type, fixed_session_minutes, min_duration_override_minutes")
        .or("published.eq.true,is_published.eq.true")
        .order("created_at", { ascending: false })
        .limit(20)

      const candidate = (listings ?? []).find(l => !recentIds.has(l.id))
      if (candidate) {
        const duration = candidate.fixed_session_minutes ?? candidate.min_duration_override_minutes ?? 60
        listingContext = `\n\nFEATURED LISTING FOR HOST SPOTLIGHT:\nTitle: ${candidate.title}\nLocation: ${candidate.city ?? "Seattle"}, ${candidate.state ?? "WA"}\nPrice: $${candidate.price_solo}\nService: ${candidate.service_type}\nSession length: ${duration} min\nListing ID: ${candidate.id}`
      }
    }

    const month = new Date().toLocaleString("en-US", { month: "long", timeZone: "UTC" })
    const generated: SocialBrief[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0

    const platforms = [
      { key: "instagram_reel", label: "Instagram Reel (9:16 vertical video)" },
      { key: "tiktok_reel", label: "TikTok video (9:16)" },
      { key: "twitter_thread", label: "X/Twitter thread (1-3 tweets, 280 chars each)" },
      { key: "instagram_static", label: "Instagram static post (1:1 image)" },
    ]

    for (const platform of platforms) {
      if (!isPostDay(platform.key)) continue

      const prompt = `Generate social content for thrml for today.

TODAY'S CONTENT PILLAR: ${pillar}
PLATFORM: ${platform.label}
MONTH: ${month} (use seasonal context if relevant)
${listingContext}

Return a JSON object with these exact fields:
{
  "platform": "${platform.key}",
  "format": "${platform.label}",
  "pillar": "${pillar}",
  "caption": "the full post caption (max 150 words for IG/TikTok, max 840 chars for Twitter thread with line breaks between tweets)",
  "hook": "the first line/sentence that stops the scroll",
  "visual_concept": "1-2 sentences describing what to film/shoot for this post",
  "cta": "Book at usethrml.com or Link in bio",
  "hashtags": ["3", "to", "5", "relevant", "hashtags"]
}`

      const result = await callAgentJson<SocialBrief>({ skill: "social", prompt, maxTokens: 800 })
      if (!result) {
        console.error("[agent-social] Claude returned null for", platform.key, "- check ANTHROPIC_API_KEY in Vercel")
      }
      if (result) {
        generated.push(result)
        // Write to creative_queue
        await admin.from("creative_queue").insert({
          platform: platform.key.includes("instagram") ? "meta" : platform.key.includes("tiktok") ? "tiktok" : "social",
          queue_type: platform.key.includes("reel") ? "social_reel" : platform.key.includes("thread") ? "social_thread" : "social_static",
          goal_type: "guest",
          priority: "MEDIUM",
          reason: `Auto-generated social content for ${today} — pillar: ${pillar}`,
          concept: pillar,
          format: platform.key.includes("reel") ? "9x16" : "1x1",
          cta: result.cta,
          copy_suggestion: result.caption,
          hook_suggestion: result.hook,
          status: "PENDING",
          audience_suggestion: result.visual_concept,
        })
      }
    }

    const results = { date: today, pillar, postsGenerated: generated.length }
    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart,
      results, claude_input_tokens: totalInputTokens, claude_output_tokens: totalOutputTokens,
    }).eq("id", runId)

    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) await admin.from("agent_runs").update({
      status: "error", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, error_message: msg,
    }).eq("id", runId)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
