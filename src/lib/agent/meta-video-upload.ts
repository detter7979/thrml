/**
 * Meta Marketing API helpers for async video upload.
 */

import { getMetaAdAccountId, getMetaMarketingApiToken, META_GRAPH_BASE } from "@/lib/agent/meta-api"

export interface UploadVideoArgs {
  fileUrl: string
  name?: string
}

export interface UploadedVideo {
  videoId: string
  thumbnailImageHash: string
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
  image_hash: string
  uri: string
  is_preferred: boolean
}

export async function fetchPreferredThumbnail(videoId: string): Promise<string> {
  const res = await fetch(
    `${META_GRAPH_BASE}/${videoId}/thumbnails?fields=image_hash,uri,is_preferred&access_token=${encodeURIComponent(token())}`
  )
  if (!res.ok) {
    throw new Error(`Meta thumbnail fetch failed (${res.status}): ${await res.text()}`)
  }
  const data = (await res.json()) as { data?: ThumbnailRow[] }
  const thumbs = data.data ?? []
  if (thumbs.length === 0) {
    throw new Error(`Meta returned no thumbnails for video ${videoId}`)
  }
  const preferred = thumbs.find((t) => t.is_preferred) ?? thumbs[0]
  return preferred.image_hash
}

export async function uploadVideo(args: UploadVideoArgs): Promise<UploadedVideo> {
  const { videoId } = await initiateVideoUpload(args)
  await pollVideoReady(videoId)
  const thumbnailImageHash = await fetchPreferredThumbnail(videoId)
  return { videoId, thumbnailImageHash }
}
