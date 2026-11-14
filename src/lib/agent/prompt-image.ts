/**
 * Prompt → image, saved straight into the creative asset library (GCS) so any brief can use it
 * as its photo. The prompt is sent as written: no brand style suffix is appended.
 */
import { uploadBufferToCreativeObject } from "@/lib/agent/gcs"
import { generateImagen } from "@/lib/agent/imagen"

export const PROMPT_IMAGE_MODELS = {
  nano_banana: {
    label: "Nano Banana (Gemini, Vertex)",
    note: "Google's current image model. Strong photorealism; good for edits later.",
  },
  flux_2_pro: {
    label: "FLUX.2 Pro (Replicate)",
    note: "Top photorealism. Describe what you want; it ignores \"no X\" instructions.",
  },
  flux_schnell: {
    label: "FLUX Schnell (Replicate)",
    note: "Fast, cheap drafts for exploring an idea.",
  },
} as const

export type PromptImageModel = keyof typeof PROMPT_IMAGE_MODELS
export const PROMPT_IMAGE_ASPECTS = ["4:3", "1:1", "4:5", "3:4", "9:16", "16:9"] as const
export type PromptImageAspect = (typeof PROMPT_IMAGE_ASPECTS)[number]

const REPLICATE_SLUGS: Record<Exclude<PromptImageModel, "nano_banana">, string> = {
  flux_2_pro: process.env.REPLICATE_FLUX_PRO_MODEL?.trim() || "black-forest-labs/flux-2-pro",
  flux_schnell: "black-forest-labs/flux-schnell",
}

export function isPromptImageModel(value: unknown): value is PromptImageModel {
  return typeof value === "string" && value in PROMPT_IMAGE_MODELS
}

export function isPromptImageAspect(value: unknown): value is PromptImageAspect {
  return typeof value === "string" && (PROMPT_IMAGE_ASPECTS as readonly string[]).includes(value)
}

type GeneratedImage = { buffer: Buffer; mimeType: string }

async function replicatePrediction(model: string, input: Record<string, unknown>): Promise<string[]> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured")
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: { ...headers, Prefer: "wait=60" },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) throw new Error(`Replicate ${model} failed (${res.status}): ${(await res.text()).slice(0, 400)}`)
  let payload = (await res.json()) as {
    status?: string
    output?: unknown
    error?: string
    urls?: { get?: string }
  }

  // Slower models can outlast the wait window: poll until the prediction settles (≤ ~4 min).
  for (let i = 0; i < 80 && payload.status && !["succeeded", "failed", "canceled"].includes(payload.status); i++) {
    if (!payload.urls?.get) break
    await new Promise((r) => setTimeout(r, 3000))
    const poll = await fetch(payload.urls.get, { headers })
    if (!poll.ok) throw new Error(`Replicate poll failed (${poll.status})`)
    payload = (await poll.json()) as typeof payload
  }
  if (payload.status === "failed" || payload.status === "canceled") {
    throw new Error(`Replicate ${model} ${payload.status}: ${payload.error ?? "no detail"}`)
  }
  const out = payload.output
  if (typeof out === "string") return [out]
  if (Array.isArray(out)) return out.filter((o): o is string => typeof o === "string")
  throw new Error(`Replicate ${model} returned no image (status ${payload.status ?? "unknown"})`)
}

async function download(url: string): Promise<GeneratedImage> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed (${res.status})`)
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "image/png" }
}

async function generate(
  model: PromptImageModel,
  prompt: string,
  aspectRatio: PromptImageAspect,
  count: 1 | 2 | 3 | 4,
): Promise<GeneratedImage[]> {
  if (model === "nano_banana") {
    const images = await generateImagen(prompt, { aspectRatio, count, raw: true })
    return images.map((img) => ({ buffer: Buffer.from(img.base64, "base64"), mimeType: img.mimeType }))
  }
  if (model === "flux_schnell") {
    const urls = await replicatePrediction(REPLICATE_SLUGS.flux_schnell, {
      prompt,
      aspect_ratio: aspectRatio,
      num_outputs: count,
      output_format: "png",
    })
    return Promise.all(urls.map(download))
  }
  // FLUX.2 Pro returns one image per prediction: run them in parallel.
  const runs = await Promise.all(
    Array.from({ length: count }, () =>
      replicatePrediction(REPLICATE_SLUGS.flux_2_pro, { prompt, aspect_ratio: aspectRatio, output_format: "png" }),
    ),
  )
  return Promise.all(runs.flat().map(download))
}

function slugify(prompt: string) {
  return (
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .split("-")
      .filter(Boolean)
      .slice(0, 6)
      .join("-") || "image"
  )
}

function extension(mimeType: string) {
  if (/jpe?g/.test(mimeType)) return "jpg"
  if (/webp/.test(mimeType)) return "webp"
  return "png"
}

export type PromptImageResult = { gcsPath: string; gcsUrl: string; filename: string }

/** Generate `count` images and save them to `{year}/library/generated/` in the creative bucket. */
export async function generatePromptImages(args: {
  prompt: string
  model: PromptImageModel
  aspectRatio: PromptImageAspect
  count: 1 | 2 | 3 | 4
}): Promise<PromptImageResult[]> {
  const prompt = args.prompt.trim()
  if (!prompt) throw new Error("Prompt is required")
  const images = await generate(args.model, prompt, args.aspectRatio, args.count)

  const now = new Date()
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) // 20261113T164500
  const base = `${now.getUTCFullYear()}/library/generated/${slugify(prompt)}_${args.model}_${stamp}`

  return Promise.all(
    images.map(async (img, i) => {
      const objectPath = `${base}_${i + 1}.${extension(img.mimeType)}`
      const uploaded = await uploadBufferToCreativeObject(objectPath, img.buffer, img.mimeType, {
        source: "prompt_image",
        model: args.model,
        aspect_ratio: args.aspectRatio,
        prompt: prompt.slice(0, 2000),
      })
      return { gcsPath: uploaded.gcsPath, gcsUrl: uploaded.gcsUrl, filename: objectPath.split("/").at(-1)! }
    }),
  )
}
