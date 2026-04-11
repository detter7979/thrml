import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

type QueueItem = {
  id: string
  queue_type: string
  copy_suggestion: string | null
  audience_suggestion: string | null
  platform: string
  hook_suggestion: string | null
}

// ── Meta Instagram Content Publishing API ─────────────────────────────────
// Publishes text-only posts (captions) to Instagram as carousels or text posts.
// For reels/images, we create a container with media_type=REELS if video URL provided.
// Since we're generating text content (no actual video file), we publish as text
// via Facebook Page posts which cross-post to Instagram via the linked page.

async function publishToFacebookPage(
  pageAccessToken: string,
  pageId: string,
  message: string
): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  })
  if (!res.ok) {
    console.error("[social-publish] Facebook feed post failed", res.status, await res.text())
    return null
  }
  const data = await res.json() as { id?: string }
  return data.id ?? null
}

async function getPageAccessToken(userToken: string, pageId: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${userToken}`
  )
  if (!res.ok) return null
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

// ── X/Twitter API v2 ───────────────────────────────────────────────────────
async function publishToTwitter(
  bearerToken: string,
  text: string
): Promise<string | null> {
  // Split into thread if multi-tweet (separated by double newline)
  const tweets = text.split("\n\n").filter(t => t.trim().length > 0).map(t => t.trim())
  let lastTweetId: string | null = null

  for (const tweetText of tweets) {
    const body: Record<string, unknown> = { text: tweetText.slice(0, 280) }
    if (lastTweetId) {
      body.reply = { in_reply_to_tweet_id: lastTweetId }
    }

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      console.error("[social-publish] Twitter post failed", res.status, await res.text())
      return lastTweetId // return what we managed to post
    }

    const data = await res.json() as { data?: { id: string } }
    lastTweetId = data.data?.id ?? null
  }

  return lastTweetId
}

function formatCaption(item: QueueItem): string {
  let text = item.copy_suggestion ?? ""
  if (!text.includes("usethrml.com")) {
    text = text.trimEnd() + "\n\nBook at usethrml.com"
  }
  return text.trim()
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "social-publish", status: "running" })
    .select("id").single()
  const runId = runRow?.id ?? null

  const results = { published: 0, skipped: 0, errors: 0, platforms: [] as string[] }

  try {
    // Get platform credentials from env + platform_settings
    const metaToken = process.env.META_MARKETING_API_TOKEN
    const twitterToken = process.env.TWITTER_BEARER_TOKEN

    const { data: settings } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["meta_page_id", "meta_instagram_id"])
    const settingsMap = new Map((settings ?? []).map(s => [s.key, s.value as string]))
    const metaPageId = settingsMap.get("meta_page_id")

    if (!metaToken && !twitterToken) {
      if (runId) await admin.from("agent_runs").update({
        status: "skipped", completed_at: new Date().toISOString(),
        results: { reason: "No publish credentials configured" },
      }).eq("id", runId)
      return NextResponse.json({ ok: true, skipped: true, reason: "No social credentials set" })
    }

    // Fetch approved, unpublished items (max 4 per run — 2 per platform)
    const { data: items } = await admin
      .from("creative_queue")
      .select("id, queue_type, copy_suggestion, audience_suggestion, platform, hook_suggestion")
      .eq("status", "PENDING")
      .not("approved_at", "is", null)
      .is("published_at", null)
      .in("queue_type", ["social_reel", "social_static", "social_thread"])
      .order("approved_at", { ascending: true })
      .limit(6)

    const platformCount: Record<string, number> = {}

    for (const item of (items ?? []) as QueueItem[]) {
      try {
        const caption = formatCaption(item)
        let publishedId: string | null = null
        let publishedPlatform = ""

        // Route by queue_type
        if ((item.queue_type === "social_reel" || item.queue_type === "social_static") && metaToken && metaPageId) {
          const platformKey = "facebook"
          if ((platformCount[platformKey] ?? 0) >= 2) { results.skipped++; continue }

          // Get page access token
          const pageToken = await getPageAccessToken(metaToken, metaPageId)
          if (!pageToken) { results.errors++; continue }

          publishedId = await publishToFacebookPage(pageToken, metaPageId, caption)
          publishedPlatform = "facebook/instagram"
          platformCount[platformKey] = (platformCount[platformKey] ?? 0) + 1

        } else if (item.queue_type === "social_thread" && twitterToken) {
          const platformKey = "twitter"
          if ((platformCount[platformKey] ?? 0) >= 2) { results.skipped++; continue }

          publishedId = await publishToTwitter(twitterToken, caption)
          publishedPlatform = "twitter"
          platformCount[platformKey] = (platformCount[platformKey] ?? 0) + 1
        } else {
          results.skipped++
          continue
        }

        if (publishedId) {
          await admin.from("creative_queue").update({
            status: "PUBLISHED",
            published_at: new Date().toISOString(),
            publish_platform_id: publishedId,
          }).eq("id", item.id)
          results.published++
          if (!results.platforms.includes(publishedPlatform)) {
            results.platforms.push(publishedPlatform)
          }
        } else {
          results.errors++
        }
      } catch (itemErr) {
        results.errors++
        console.error("[social-publish] item error", item.id, itemErr)
      }
    }

    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, results,
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
