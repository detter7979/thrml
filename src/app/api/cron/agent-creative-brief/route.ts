import { Storage } from "@google-cloud/storage"
import { NextRequest, NextResponse } from "next/server"

import { callAgentJson } from "@/lib/agent/claude"
import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AGENT_NAME = "creative-brief"
const MIDJOURNEY_BASE_URL = process.env.MIDJOURNEY_API_BASE_URL ?? "https://api.goapi.ai/mj/v2"
const MIDJOURNEY_POLL_DELAY_MS = 5000
const MIDJOURNEY_MAX_ATTEMPTS = 36

type CreativeBriefRow = {
  id: string
  trigger_type: string | null
  trigger_data: unknown
  status: string | null
}

type GeneratedBrief = {
  hook: string
  visual_direction: string
  copy_primary: string
  copy_headline: string
  cta: string
  format?: string
  target_audience?: string
  rationale?: string
}

type MidjourneyResponse = Record<string, unknown>

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function monthPath() {
  return new Date().toISOString().slice(0, 7)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getNestedString(obj: unknown, path: string[]): string | null {
  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[key]
  }
  return pickString(current)
}

function extractTaskId(payload: MidjourneyResponse) {
  return (
    getNestedString(payload, ["task_id"]) ??
    getNestedString(payload, ["taskId"]) ??
    getNestedString(payload, ["id"]) ??
    getNestedString(payload, ["data", "task_id"]) ??
    getNestedString(payload, ["data", "taskId"]) ??
    getNestedString(payload, ["data", "id"])
  )
}

function extractImageUrl(payload: MidjourneyResponse) {
  return (
    getNestedString(payload, ["image_url"]) ??
    getNestedString(payload, ["imageUrl"]) ??
    getNestedString(payload, ["url"]) ??
    getNestedString(payload, ["data", "image_url"]) ??
    getNestedString(payload, ["data", "imageUrl"]) ??
    getNestedString(payload, ["data", "url"]) ??
    getNestedString(payload, ["data", "task_result", "image_url"]) ??
    getNestedString(payload, ["data", "task_result", "imageUrl"]) ??
    getNestedString(payload, ["data", "task_result", "discord_image_url"])
  )
}

function extractStatus(payload: MidjourneyResponse) {
  return (
    getNestedString(payload, ["status"]) ??
    getNestedString(payload, ["state"]) ??
    getNestedString(payload, ["data", "status"]) ??
    getNestedString(payload, ["data", "state"])
  )?.toLowerCase() ?? null
}

function isComplete(status: string | null, imageUrl: string | null) {
  if (imageUrl) return true
  return status ? ["completed", "complete", "finished", "success", "succeeded"].includes(status) : false
}

function isFailed(status: string | null) {
  return status ? ["failed", "error", "cancelled", "canceled"].includes(status) : false
}

async function midjourneyRequest(path: string, body: Record<string, unknown>) {
  const apiKey = requireEnv("MIDJOURNEY_API_KEY")
  const res = await fetch(`${MIDJOURNEY_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Midjourney ${path} failed (${res.status}): ${text.slice(0, 300)}`)
  }

  return (await res.json()) as MidjourneyResponse
}

async function generateMidjourneyReference(prompt: string) {
  const imagine = await midjourneyRequest("/imagine", { prompt })
  const taskId = extractTaskId(imagine)
  const immediateImageUrl = extractImageUrl(imagine)
  if (immediateImageUrl) return immediateImageUrl
  if (!taskId) throw new Error("Midjourney imagine response did not include a task id")

  for (let attempt = 1; attempt <= MIDJOURNEY_MAX_ATTEMPTS; attempt++) {
    await sleep(MIDJOURNEY_POLL_DELAY_MS)
    const fetched = await midjourneyRequest("/fetch", { task_id: taskId })
    const status = extractStatus(fetched)
    const imageUrl = extractImageUrl(fetched)

    if (isComplete(status, imageUrl) && imageUrl) return imageUrl
    if (isFailed(status)) throw new Error(`Midjourney task ${taskId} failed with status ${status}`)
  }

  throw new Error(`Midjourney task ${taskId} did not complete in time`)
}

async function downloadImage(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

function createStorageClient() {
  const credentials = loadGoogleServiceAccountCredentials()
  return new Storage({ credentials })
}

async function uploadReferenceImage(buffer: Buffer, briefId: string, index: number) {
  const bucketName = requireEnv("GCS_BUCKET_NAME")
  const storage = createStorageClient()
  const gcsPath = `${monthPath()}/${briefId}/reference_${index}.jpg`
  const file = storage.bucket(bucketName).file(gcsPath)

  await file.save(buffer, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  })

  return `https://storage.googleapis.com/${bucketName}/${gcsPath}`
}

function buildPrompt(brief: CreativeBriefRow) {
  return `Expand this pending paid ad creative trigger into a complete thrml creative brief.

Trigger type: ${brief.trigger_type ?? "new_concept"}
Trigger data:
${JSON.stringify(brief.trigger_data ?? {}, null, 2)}

Return a JSON object with these exact fields:
{
  "hook": "short scroll-stopping hook",
  "visual_direction": "Midjourney-ready reference image prompt direction, 9:16 vertical, no text overlays",
  "copy_primary": "primary paid ad copy, concise and on-brand",
  "copy_headline": "short paid ad headline",
  "cta": "direct CTA",
  "format": "recommended format",
  "target_audience": "who this ad is for",
  "rationale": "one sentence explaining the strategy"
}`
}

function normalizeGeneratedBrief(result: GeneratedBrief | null) {
  if (!result?.hook || !result.visual_direction || !result.copy_primary || !result.copy_headline || !result.cta) {
    throw new Error("Claude response missing required creative brief fields")
  }

  return {
    hook: result.hook,
    visual_direction: result.visual_direction,
    copy_primary: result.copy_primary,
    copy_headline: result.copy_headline,
    cta: result.cta,
    format: result.format ?? "Static reference + paid ad copy",
    target_audience: result.target_audience ?? null,
    rationale: result.rationale ?? null,
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: AGENT_NAME, status: "running" })
    .select("id")
    .single()
  const runId = runRow?.id ?? null

  const results = {
    processed: 0,
    briefed: 0,
    queued: 0,
    errors: [] as Array<{ briefId: string; error: string }>,
  }

  try {
    const { data: briefs, error: briefsError } = await admin
      .from("creative_briefs")
      .select("id, trigger_type, trigger_data, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3)

    if (briefsError) throw briefsError
    if (!briefs?.length) {
      if (runId) {
        await admin
          .from("agent_runs")
          .update({
            status: "success",
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - runStart,
            results,
            error_message: null,
          })
          .eq("id", runId)
      }
      return NextResponse.json({ ok: true, ...results })
    }

    requireEnv("MIDJOURNEY_API_KEY")
    requireEnv("GCS_BUCKET_NAME")
    loadGoogleServiceAccountCredentials()

    for (const brief of (briefs ?? []) as CreativeBriefRow[]) {
      results.processed++
      try {
        const generated = normalizeGeneratedBrief(
          await callAgentJson<GeneratedBrief>({
            skill: "creative",
            prompt: buildPrompt(brief),
            maxTokens: 2000,
          })
        )

        const midjourneyUrl = await generateMidjourneyReference(generated.visual_direction)
        const imageBuffer = await downloadImage(midjourneyUrl)
        const referenceUrl = await uploadReferenceImage(imageBuffer, brief.id, 1)

        const { error: updateError } = await admin
          .from("creative_briefs")
          .update({
            ...generated,
            reference_image_urls: [referenceUrl],
            status: "briefed",
          })
          .eq("id", brief.id)
        if (updateError) throw updateError
        results.briefed++

        const { error: queueError } = await admin.from("creative_queue").insert({
          type: "paid_ad",
          queue_type: "paid_ad",
          status: "brief_ready",
          brief_id: brief.id,
          copy_suggestion: generated.copy_primary,
          hook_suggestion: generated.hook,
          cta: generated.cta,
          format: generated.format,
          reason: generated.rationale ?? `Creative brief generated from ${brief.trigger_type ?? "pending"} trigger`,
          platform: "meta",
          goal_type: "guest",
          priority: "MEDIUM",
          concept: brief.trigger_type,
          audience_suggestion: generated.target_audience,
        })
        if (queueError) throw queueError
        results.queued++
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        results.errors.push({ briefId: brief.id, error: message })
        console.error(`[agent-creative-brief] Failed brief ${brief.id}`, err)
      }
    }

    const status = results.errors.length > 0 && results.briefed === 0 ? "error" : "success"
    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          results,
          error_message: results.errors.length ? `${results.errors.length} brief(s) failed` : null,
        })
        .eq("id", runId)
    }

    return NextResponse.json({ ok: status === "success", ...results }, { status: status === "success" ? 200 : 500 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) {
      await admin
        .from("agent_runs")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - runStart,
          error_message: msg,
          results,
        })
        .eq("id", runId)
    }
    return NextResponse.json({ ok: false, error: msg, ...results }, { status: 500 })
  }
}
