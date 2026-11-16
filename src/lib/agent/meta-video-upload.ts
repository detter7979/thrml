/**
 * Meta Marketing API helpers for async video upload.
 */

import { getMetaAdAccountId, getMetaMarketingApiToken, META_GRAPH_BASE } from "@/lib/agent/meta-api"

export interface UploadVideoArgs {
  fileUrl: string
  name?: string
}

/** A video ad needs a thumbnail: Meta accepts either an image hash or an image URL. */
export interface VideoThumbnail {
  imageHash?: string
  imageUrl?: string
}

export interface UploadedVideo {
  videoId: string
  thumbnail: VideoThumbnail
}

function token() {
  return getMetaMarketingApiToken()
}

function adAccountId() {
  return getMetaAdAccountId()
}

export async function initiateVideoUpload(args: UploadVideoArgs): Promise<{ videoId: string }> {
  const body = new URLSearchParams({
    file_url: args.fileUrl,
    access_token: token(),
  })
  if (args.name) body.set("name", args.name)

  const res = await fetch(`${META_GRAPH_BASE}/${adAccountId()}/advideos`, {
    method: "POST",
    body,
  })
  if (!res.ok) {
    throw new Error(`Meta video upload failed (${res.status}): ${await res.text()}`)
  }
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error(`Meta video upload returned no id: ${JSON.stringify(data)}`)
  return { videoId: data.id }
}

interface VideoStatus {
  status?: { video_status?: "processing" | "ready" | "error"; error?: { message?: string } }
}

export async function pollVideoReady(
  videoId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<void> {
  const interval = opts.intervalMs ?? 5_000
  const timeout = opts.timeoutMs ?? 3 * 60_000
  const start = Date.now()

  while (true) {
    const res = await fetch(
      `${META_GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(token())}`
    )
    if (!res.ok) {
      throw new Error(`Meta video status poll failed (${res.status}): ${await res.text()}`)
    }
    const data = (await res.json()) as VideoStatus
    const s = data.status?.video_status
    if (s === "ready") return
    if (s === "error") {
      throw new Error(`Meta video processing failed: ${data.status?.error?.message ?? "unknown"}`)
    }
    if (Date.now() - start > timeout) {
      throw new Error(`Meta video ${videoId} not ready after ${timeout}ms (last status: ${s ?? "unknown"})`)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}

interface ThumbnailRow {
  image_hash?: string | null
  uri?: string | null
  is_preferred?: boolean
}

function hasThumbnail(t: VideoThumbnail): boolean {
  return Boolean(t.imageHash?.trim() || t.imageUrl?.trim())
}

/**
 * Thumbnail Meta generated for a video. Meta often returns thumbnail rows without an image_hash, so
 * fall back to the row's uri, then to the video's `picture`. Thumbnails can lag a few seconds behind
 * "ready", so this retries briefly.
 */
export async function fetchVideoThumbnail(
  videoId: string,
  opts: { attempts?: number; delayMs?: number } = {}
): Promise<VideoThumbnail> {
  const attempts = opts.attempts ?? 4
  const delayMs = opts.delayMs ?? 4_000
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${META_GRAPH_BASE}/${videoId}/thumbnails?fields=image_hash,uri,is_preferred&access_token=${encodeURIComponent(token())}`
    )
    if (res.ok) {
      const data = (await res.json()) as { data?: ThumbnailRow[] }
      const rows = data.data ?? []
      const preferred = rows.find((t) => t.is_preferred) ?? rows[0]
      const thumb: VideoThumbnail = {
        imageHash: preferred?.image_hash?.trim() || undefined,
        imageUrl: preferred?.uri?.trim() || undefined,
      }
      if (hasThumbnail(thumb)) return thumb
    }
    const pic = await fetch(
      `${META_GRAPH_BASE}/${videoId}?fields=picture&access_token=${encodeURIComponent(token())}`
    )
    if (pic.ok) {
      const data = (await pic.json()) as { picture?: string }
      if (data.picture?.trim()) return { imageUrl: data.picture.trim() }
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  throw new Error(`Meta returned no thumbnail for video ${videoId}`)
}

/** @deprecated use fetchVideoThumbnail */
export async function fetchPreferredThumbnail(videoId: string): Promise<string> {
  const t = await fetchVideoThumbnail(videoId)
  return t.imageHash ?? t.imageUrl ?? ""
}

export async function uploadVideo(args: UploadVideoArgs): Promise<UploadedVideo> {
  const { videoId } = await initiateVideoUpload(args)
  await pollVideoReady(videoId)
  const thumbnail = await fetchVideoThumbnail(videoId)
  return { videoId, thumbnail }
}

/** Video data for a Meta ad creative's object_story_spec: thumbnail as image_hash, else image_url. */
export function videoThumbnailFields(t: VideoThumbnail): { image_hash: string } | { image_url: string } {
  if (t.imageHash?.trim()) return { image_hash: t.imageHash.trim() }
  if (t.imageUrl?.trim()) return { image_url: t.imageUrl.trim() }
  throw new Error("Video ad needs a thumbnail (image_hash or image_url)")
}
