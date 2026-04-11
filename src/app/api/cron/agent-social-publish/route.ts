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
  concept: string | null
  platform: string
}

type BufferChannels = {
  instagram: string | null
  tiktok: string | null
  twitter: string | null
}

async function getBufferChannels(admin: ReturnType<typeof createAdminClient>): Promise<BufferChannels> {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["buffer_channel_instagram", "buffer_channel_tiktok", "buffer_channel_twitter"])
  const m = new Map((data ?? []).map(r => [r.key, r.value as string]))
  return {
    instagram: m.get("buffer_channel_instagram") ?? null,
    tiktok: m.get("buffer_channel_tiktok") ?? null,
    twitter: m.get("buffer_channel_twitter") ?? null,
  }
}

async function publishToBuffer(
  token: string,
  profileIds: string[],
  text: string,
  scheduledAt?: string
): Promise<string | null> {
  if (profileIds.length === 0) return null

  const body: Record<string, unknown> = {
    profile_ids: profileIds,
    text,
  }
  if (scheduledAt) {
    body.scheduled_at = scheduledAt
    body.now = false
  } else {
    body.now = false
    // Schedule 24h from now
    body.scheduled_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  }

  const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[agent-social-publish] Buffer API error", res.status, err)
    return null
  }

  const data = await res.json() as { updates?: { id: string }[] }
  return data?.updates?.[0]?.id ?? null
}

function formatCaption(item: QueueItem): string {
  let text = item.copy_suggestion ?? ""

  // Append hashtags if stored in audience_suggestion as space-separated tags
  if (item.audience_suggestion && item.audience_suggestion.startsWith("#")) {
    text = text.trimEnd() + "\n\n" + item.audience_suggestion
  }

  // Ensure CTA present
  if (!text.includes("usethrml.com")) {
    text = text.trimEnd() + "\n\nBook at usethrml.com"
  }

  return text.trim()
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = process.env.BUFFER_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ ok: true, skipped: true, reason: "BUFFER_ACCESS_TOKEN not set" })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "social-publish", status: "running" })
    .select("id").single()
  const runId = runRow?.id ?? null

  const results = { published: 0, skipped: 0, errors: 0 }

  try {
    const channels = await getBufferChannels(admin)

    // Fetch approved, unpublished items
    const { data: items } = await admin
      .from("creative_queue")
      .select("id, queue_type, copy_suggestion, audience_suggestion, concept, platform")
      .eq("status", "PENDING")
      .not("approved_at", "is", null)
      .is("published_at", null)
      .order("approved_at", { ascending: true })
      .limit(10)

    const todayPublished: Record<string, number> = {}

    for (const item of (items ?? []) as QueueItem[]) {
      try {
        // Enforce max 2 per platform per run
        const platform = item.platform
        todayPublished[platform] = (todayPublished[platform] ?? 0)
        if (todayPublished[platform] >= 2) { results.skipped++; continue }

        const caption = formatCaption(item)
        let profileIds: string[] = []

        if (item.queue_type === "social_reel") {
          profileIds = [channels.instagram, channels.tiktok].filter(Boolean) as string[]
        } else if (item.queue_type === "social_static") {
          profileIds = channels.instagram ? [channels.instagram] : []
        } else if (item.queue_type === "social_thread") {
          profileIds = channels.twitter ? [channels.twitter] : []
        }

        if (profileIds.length === 0) { results.skipped++; continue }

        const bufferId = await publishToBuffer(token, profileIds, caption)
        if (bufferId) {
          await admin.from("creative_queue").update({
            status: "PUBLISHED",
            published_at: new Date().toISOString(),
            publish_platform_id: bufferId,
          }).eq("id", item.id)
          todayPublished[platform]++
          results.published++
        } else {
          results.errors++
        }
      } catch (itemErr) {
        results.errors++
        console.error("[agent-social-publish] item error", item.id, itemErr)
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
