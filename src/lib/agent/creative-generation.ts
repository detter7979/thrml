import { Storage } from "@google-cloud/storage"

import { sendEmail, thrmlEmailWrapper } from "@/lib/emails/send"
import { createAdminClient } from "@/lib/supabase/admin"

const HIGGSFIELD_BASE_URL = "https://platform.higgsfield.ai"
const HIGGSFIELD_MODEL_ID = process.env.HIGGSFIELD_MODEL_ID ?? "higgsfield-ai/dop/standard"
const HIGGSFIELD_POLL_INTERVAL_MS = 30_000
const HIGGSFIELD_MAX_ATTEMPTS = 8
const CREATIVE_REVIEW_RECIPIENT = "etter.dom@gmail.com"

type CreativeQueueRow = {
  id: string
  brief_id: string | null
  status: string | null
  approved_at: string | null
}

type CreativeBriefRow = {
  id: string
  visual_direction: string | null
  reference_image_urls: string[] | null
}

type HiggsfieldResponse = Record<string, unknown>

export type CreativeGenerationResult = {
  processed: number
  generated: number
  queued: number
  errors: Array<{ queueId: string; briefId?: string | null; error: string }>
}

type GenerateCreativeOptions = {
  limit?: number
  queueIds?: string[]
  briefIds?: string[]
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

function getNestedString(obj: unknown, path: string[]) {
  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[key]
  }
  return pickString(current)
}

function getNestedArray(obj: unknown, path: string[]) {
  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[key]
  }
  return Array.isArray(current) ? current : null
}

function higgsfieldAuthorization() {
  const key = requireEnv("HIGGSFIELD_API_KEY").trim()
  return key.toLowerCase().startsWith("key ") ? key : `Key ${key}`
}

function higgsfieldEndpoint(path: string) {
  return `${HIGGSFIELD_BASE_URL}/${path.replace(/^\//, "")}`
}

function extractRequestId(payload: HiggsfieldResponse) {
  return (
    getNestedString(payload, ["request_id"]) ??
    getNestedString(payload, ["requestId"]) ??
    getNestedString(payload, ["id"]) ??
    getNestedString(payload, ["data", "request_id"]) ??
    getNestedString(payload, ["data", "requestId"]) ??
    getNestedString(payload, ["data", "id"])
  )
}

function extractStatusUrl(payload: HiggsfieldResponse) {
  return getNestedString(payload, ["status_url"]) ?? getNestedString(payload, ["data", "status_url"])
}

function extractStatus(payload: HiggsfieldResponse) {
  return (
    getNestedString(payload, ["status"]) ??
    getNestedString(payload, ["state"]) ??
    getNestedString(payload, ["data", "status"]) ??
    getNestedString(payload, ["data", "state"])
  )?.toLowerCase()
}

function extractVideoUrl(payload: HiggsfieldResponse) {
  const videos = getNestedArray(payload, ["videos"]) ?? getNestedArray(payload, ["data", "videos"])
  const firstVideo = videos?.[0]

  return (
    getNestedString(payload, ["video", "url"]) ??
    getNestedString(payload, ["data", "video", "url"]) ??
    getNestedString(payload, ["output", "video", "url"]) ??
    getNestedString(payload, ["url"]) ??
    getNestedString(payload, ["data", "url"]) ??
    getNestedString(firstVideo, ["url"])
  )
}

function isComplete(status: string | null | undefined, videoUrl: string | null) {
  if (videoUrl) return true
  return status ? ["completed", "complete", "finished", "success", "succeeded"].includes(status) : false
}

function isFailed(status: string | null | undefined) {
  return status ? ["failed", "error", "cancelled", "canceled", "nsfw"].includes(status) : false
}

async function readError(res: Response) {
  const text = await res.text()
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text
  }
}

async function postHiggsfield(body: Record<string, unknown>) {
  const res = await fetch(higgsfieldEndpoint(HIGGSFIELD_MODEL_ID), {
    method: "POST",
    headers: {
      Authorization: higgsfieldAuthorization(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Higgsfield request failed (${res.status}): ${(await readError(res)).slice(0, 500)}`)
  }

  return (await res.json()) as HiggsfieldResponse
}

async function createHiggsfieldRequest(startImageUrl: string, prompt: string) {
  const duration = Number(process.env.HIGGSFIELD_DURATION_SECONDS ?? 5)
  const baseBody = {
    prompt,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 5,
  }

  try {
    return await postHiggsfield({ ...baseBody, start_image_url: startImageUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : ""
    if (!message.includes("(400)") && !message.includes("(422)")) throw err
    return postHiggsfield({ ...baseBody, image_url: startImageUrl })
  }
}

async function pollHiggsfieldRequest(request: HiggsfieldResponse) {
  const immediateVideoUrl = extractVideoUrl(request)
  if (immediateVideoUrl) return immediateVideoUrl

  const requestId = extractRequestId(request)
  const statusUrl = extractStatusUrl(request) ?? (requestId ? higgsfieldEndpoint(`/requests/${requestId}/status`) : null)
  if (!statusUrl) throw new Error("Higgsfield response did not include request_id or status_url")

  for (let attempt = 1; attempt <= HIGGSFIELD_MAX_ATTEMPTS; attempt++) {
    await sleep(HIGGSFIELD_POLL_INTERVAL_MS)

    const res = await fetch(statusUrl, {
      headers: {
        Authorization: higgsfieldAuthorization(),
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      throw new Error(`Higgsfield status poll failed (${res.status}): ${(await readError(res)).slice(0, 500)}`)
    }

    const payload = (await res.json()) as HiggsfieldResponse
    const status = extractStatus(payload)
    const videoUrl = extractVideoUrl(payload)

    if (isComplete(status, videoUrl) && videoUrl) return videoUrl
    if (isFailed(status)) throw new Error(`Higgsfield request ${requestId ?? statusUrl} failed with status ${status}`)
  }

  throw new Error(`Higgsfield request ${requestId ?? statusUrl} did not complete within 4 minutes`)
}

async function generateVariation(brief: CreativeBriefRow, variationIndex: number) {
  const startImageUrl = brief.reference_image_urls?.find((url) => typeof url === "string" && url.trim())
  if (!startImageUrl) throw new Error("Creative brief is missing reference_image_urls[0]")
  if (!brief.visual_direction?.trim()) throw new Error("Creative brief is missing visual_direction")

  const request = await createHiggsfieldRequest(startImageUrl, brief.visual_direction)
  const videoUrl = await pollHiggsfieldRequest(request)
  return { requestId: extractRequestId(request), videoUrl, variationIndex }
}

async function downloadVideo(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Video download failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return Buffer.from(await res.arrayBuffer())
}

function createStorageClient() {
  const encoded = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as Record<string, unknown>
  return new Storage({ credentials })
}

async function uploadVideo(buffer: Buffer, briefId: string, variationIndex: number) {
  const bucketName = requireEnv("GCS_BUCKET_NAME")
  const storage = createStorageClient()
  const objectPath = `${monthPath()}/${briefId}/higgsfield_${variationIndex}.mp4`
  const file = storage.bucket(bucketName).file(objectPath)

  await file.save(buffer, {
    contentType: "video/mp4",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  })

  return {
    gcsPath: `${bucketName}/${objectPath}`,
    gcsUrl: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

async function sendReadyEmail(briefId: string, previewLinks: string[]) {
  const linksHtml = previewLinks
    .map((link, index) => `<li><a href="${escapeHtml(link)}" style="color:#C4623A;">Variation ${index + 1}</a></li>`)
    .join("")
  const textLinks = previewLinks.map((link, index) => `Variation ${index + 1}: ${link}`).join("\n")

  await sendEmail({
    to: CREATIVE_REVIEW_RECIPIENT,
    subject: "3 new video variations ready for review",
    html: thrmlEmailWrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 16px;">3 new video variations ready for review</h1>
      <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Creative brief ${escapeHtml(briefId)} has 3 Higgsfield variations ready.
      </p>
      <ul style="color:#d4d4d4;font-size:15px;line-height:1.8;margin:0 0 24px;padding-left:20px;">
        ${linksHtml}
      </ul>
    `),
    text: `3 new video variations ready for review\n\nCreative brief ${briefId}\n\n${textLinks}`,
  })
}

async function processQueueItem(admin: ReturnType<typeof createAdminClient>, item: CreativeQueueRow) {
  if (!item.brief_id) throw new Error("Creative queue item is missing brief_id")

  const { data: brief, error: briefError } = await admin
    .from("creative_briefs")
    .select("id, visual_direction, reference_image_urls")
    .eq("id", item.brief_id)
    .maybeSingle()

  if (briefError) throw briefError
  if (!brief) throw new Error("Linked creative brief not found")

  await admin.from("creative_queue").update({ status: "generating" }).eq("id", item.id)

  const creativeBrief = brief as CreativeBriefRow
  const variations = await Promise.all([1, 2, 3].map((index) => generateVariation(creativeBrief, index)))
  const uploaded = []

  for (const variation of variations) {
    const videoBuffer = await downloadVideo(variation.videoUrl)
    const { gcsUrl, gcsPath } = await uploadVideo(videoBuffer, creativeBrief.id, variation.variationIndex)

    const { error: insertError } = await admin.from("creative_assets").insert({
      brief_id: creativeBrief.id,
      asset_type: "video",
      generation_tool: "higgsfield",
      gcs_url: gcsUrl,
      gcs_path: gcsPath,
      status: "generated",
      variation_index: variation.variationIndex,
      performance_data: {
        higgsfield_request_id: variation.requestId,
        source_video_url: variation.videoUrl,
      },
    })
    if (insertError) throw insertError

    uploaded.push(gcsUrl)
  }

  const { error: queueError } = await admin
    .from("creative_queue")
    .update({ status: "variations_ready" })
    .eq("id", item.id)
  if (queueError) throw queueError

  await admin.from("creative_briefs").update({ status: "variations_ready" }).eq("id", creativeBrief.id)
  await sendReadyEmail(creativeBrief.id, uploaded)

  return uploaded.length
}

export async function generateCreativeVariations(options: GenerateCreativeOptions = {}): Promise<CreativeGenerationResult> {
  requireEnv("HIGGSFIELD_API_KEY")
  requireEnv("GCS_BUCKET_NAME")
  requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")

  const admin = createAdminClient()
  const limit = Math.min(Math.max(options.limit ?? 1, 1), 1)
  let query = admin
    .from("creative_queue")
    .select("id, brief_id, status, approved_at")
    .eq("status", "brief_ready")
    .not("approved_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (options.queueIds?.length) query = query.in("id", options.queueIds)
  if (options.briefIds?.length) query = query.in("brief_id", options.briefIds)

  const { data: queueItems, error: queueError } = await query
  if (queueError) throw queueError

  const result: CreativeGenerationResult = {
    processed: 0,
    generated: 0,
    queued: queueItems?.length ?? 0,
    errors: [],
  }

  for (const item of (queueItems ?? []) as CreativeQueueRow[]) {
    result.processed++
    try {
      result.generated += await processQueueItem(admin, item)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown creative generation error"
      result.errors.push({ queueId: item.id, briefId: item.brief_id, error: message })
      console.error("[creative-generation] failed", { queueId: item.id, briefId: item.brief_id, error: err })
      await admin.from("creative_queue").update({ status: "generation_failed" }).eq("id", item.id)
    }
  }

  return result
}
