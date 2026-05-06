import { Storage } from "@google-cloud/storage"
import sharp from "sharp"

import { sendEmail, thrmlEmailWrapper, ctaButton } from "@/lib/emails/send"
import { generateImagen } from "@/lib/agent/imagen"
import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
import { createAdminClient } from "@/lib/supabase/admin"

const CREATIVE_REVIEW_RECIPIENT = "etter.dom@gmail.com"
const MAX_IMAGE_GENERATIONS_PER_BRIEF = 12
const BRIEF_TIMEOUT_MS = 240_000
const VARIATION_LABELS = ["A", "B", "C"] as const

export type StaticGenerator = "imagen" | "replicate" | "both"
export type StaticFormat = "1x1" | "9x16"
export type StaticVariationCount = 1 | 2 | 3

type AspectRatio = "1:1" | "9:16"
type BaseImageGenerator = "imagen" | "replicate"

type CreativeBriefRow = {
  id: string
  trigger_data: Record<string, unknown> | null
  status: string | null
  approved_at: string | null
  visual_direction: string | null
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  cta: string | null
  hook: string | null
  format: string | null
}

type BaseImage = {
  buffer: Buffer
  mimeType: string
  generationTool: "imagen" | "replicate_mj"
  sourceUrl?: string
  sourceIndex: number
}

type CompositeStaticOptions = {
  baseImage: Buffer
  format: StaticFormat
  variationLabel: string
  copyPrimary?: string | null
  copyHeadline?: string | null
  copySubtext?: string | null
  cta?: string | null
}

export type ProcessStaticBriefOptions = {
  briefId: string
  generator?: StaticGenerator
  formats?: StaticFormat[]
  variations?: StaticVariationCount
}

export type StaticGenerationResult = {
  processed: number
  generated: number
  queued: number
  errors: Array<{ briefId: string; error: string }>
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function monthPath() {
  return new Date().toISOString().slice(0, 7)
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function sanitizeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
}

function svgEscape(value: string) {
  return escapeHtml(value).replaceAll("'", "&apos;")
}

function normalizeGenerator(value: unknown): StaticGenerator | null {
  return value === "imagen" || value === "replicate" || value === "both" ? value : null
}

function normalizeFormat(value: unknown): StaticFormat | null {
  return value === "1x1" || value === "9x16" ? value : null
}

function normalizeVariationCount(value: unknown): StaticVariationCount | null {
  return value === 1 || value === 2 || value === 3 ? value : null
}

function briefGenerator(brief: CreativeBriefRow, override?: StaticGenerator) {
  if (override) return override
  const triggerGenerator = brief.trigger_data?.generator ?? brief.trigger_data?.static_generator
  return normalizeGenerator(triggerGenerator) ?? "both"
}

function generatorsFor(generator: StaticGenerator): BaseImageGenerator[] {
  return generator === "both" ? ["imagen", "replicate"] : [generator]
}

function aspectForFormat(format: StaticFormat): AspectRatio {
  return format === "9x16" ? "9:16" : "1:1"
}

function dimensionsForFormat(format: StaticFormat) {
  return format === "9x16" ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 }
}

function countBaseImages(generatorCount: number, formatCount: number, requestedVariations: number) {
  const capPerPair = Math.floor(MAX_IMAGE_GENERATIONS_PER_BRIEF / Math.max(generatorCount * formatCount, 1))
  return Math.max(1, Math.min(requestedVariations, capPerPair))
}

function createStorageClient() {
  const credentials = loadGoogleServiceAccountCredentials()
  return new Storage({ credentials })
}

async function readError(res: Response) {
  const text = await res.text()
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text
  }
}

function extractReplicateUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return []
  const output = (payload as Record<string, unknown>).output
  if (typeof output === "string") return [output]
  if (Array.isArray(output)) return output.filter((item): item is string => typeof item === "string")
  return []
}

async function generateReplicate(prompt: string, aspectRatio: AspectRatio, count: number) {
  const token = requireEnv("REPLICATE_API_TOKEN")
  const model = process.env.REPLICATE_STATIC_MODEL ?? "black-forest-labs/flux-schnell"
  const input = {
    prompt: `${prompt}, photorealistic lifestyle ad creative, warm editorial lighting, no text, no logos`,
    aspect_ratio: aspectRatio,
    num_outputs: count,
    output_format: "png",
  }

  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ input }),
  })

  if (!res.ok) {
    throw new Error(`Replicate request failed (${res.status}): ${(await readError(res)).slice(0, 500)}`)
  }

  const payload = (await res.json()) as Record<string, unknown>
  return extractReplicateUrls(payload)
}

async function downloadImage(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const contentType = res.headers.get("content-type") ?? "image/png"
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: contentType }
}

export async function generateLifestyleImage(
  prompt: string,
  opts: { generator: StaticGenerator; aspectRatio: AspectRatio; count: StaticVariationCount }
): Promise<BaseImage[]> {
  const generators = generatorsFor(opts.generator)
  const perGeneratorCount = countBaseImages(generators.length, 1, opts.count)
  const images: BaseImage[] = []

  for (const generator of generators) {
    if (generator === "imagen") {
      const imagenResults = await generateImagen(prompt, {
        aspectRatio: opts.aspectRatio,
        count: perGeneratorCount as StaticVariationCount,
      })
      images.push(
        ...imagenResults.map((image, index) => ({
          buffer: Buffer.from(image.base64, "base64"),
          mimeType: image.mimeType,
          generationTool: "imagen" as const,
          sourceIndex: index + 1,
        }))
      )
      continue
    }

    const urls = await generateReplicate(prompt, opts.aspectRatio, perGeneratorCount)
    for (const [index, url] of urls.entries()) {
      const downloaded = await downloadImage(url)
      images.push({
        ...downloaded,
        generationTool: "replicate_mj",
        sourceUrl: url,
        sourceIndex: index + 1,
      })
    }
  }

  return images
}

function textLines(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
    if (lines.length === maxLines) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

function renderLines(lines: string[], x: number, y: number, fontSize: number, lineHeight: number, weight = 700) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-size="${fontSize}" font-weight="${weight}" fill="#fff">${svgEscape(line)}</text>`
    )
    .join("")
}

export async function compositeStatic(opts: CompositeStaticOptions) {
  const { width, height } = dimensionsForFormat(opts.format)
  const headline = opts.copyHeadline?.trim() || opts.copyPrimary?.trim() || "Book your private sauna escape"
  const body = opts.copyPrimary?.trim() || opts.copySubtext?.trim() || ""
  const cta = opts.cta?.trim() || "Book Now"
  const padding = opts.format === "9x16" ? 88 : 64
  const headlineLines = textLines(headline, opts.format === "9x16" ? 23 : 22, 3)
  const bodyLines = textLines(body, opts.format === "9x16" ? 38 : 34, 3)
  const bodyStart = height - padding - 145 - bodyLines.length * 38
  const headlineStart = bodyStart - 38 - headlineLines.length * (opts.format === "9x16" ? 72 : 64)
  const overlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.08"/>
          <stop offset="48%" stop-color="#000" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#shade)"/>
      <rect x="${padding}" y="${height - padding - 96}" rx="48" ry="48" width="${Math.min(320, width - padding * 2)}" height="96" fill="#C4623A"/>
      <text x="${padding + 40}" y="${height - padding - 36}" font-size="34" font-weight="800" fill="#fff">${svgEscape(cta)}</text>
      <text x="${padding}" y="${padding + 8}" font-size="24" font-weight="700" letter-spacing="4" fill="#fff">THRML</text>
      <text x="${width - padding}" y="${padding + 8}" font-size="22" font-weight="700" text-anchor="end" fill="#fff">${svgEscape(opts.variationLabel)}</text>
      ${renderLines(headlineLines, padding, Math.max(padding + 112, headlineStart), opts.format === "9x16" ? 64 : 56, opts.format === "9x16" ? 72 : 64)}
      ${renderLines(bodyLines, padding, bodyStart, 30, 38, 500)}
    </svg>
  `

  return sharp(opts.baseImage)
    .resize(width, height, { fit: "cover", position: "center" })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer()
}

export async function uploadCreativeAsset(buffer: Buffer, briefId: string, format: StaticFormat, variationLabel: string) {
  const bucketName = requireEnv("GCS_BUCKET_NAME")
  const storage = createStorageClient()
  const objectPath = `${monthPath()}/${briefId}/static_${format}_${sanitizeFilename(variationLabel)}.png`
  const file = storage.bucket(bucketName).file(objectPath)

  await file.save(buffer, {
    contentType: "image/png",
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

async function sendReadyEmail(count: number, brief: CreativeBriefRow) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const reviewUrl = `${appUrl}/admin/agents?tab=creatives`
  const subject = `${count} new creative variations ready for review — ${brief.hook ?? "Static creative"}`

  await sendEmail({
    to: CREATIVE_REVIEW_RECIPIENT,
    subject,
    html: thrmlEmailWrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
      <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Static creative variations are ready for review in the agent dashboard.
      </p>
      ${ctaButton("Review creatives", reviewUrl)}
    `),
    text: `${subject}\n\nReview: ${reviewUrl}`,
  })
}

async function getBrief(admin: ReturnType<typeof createAdminClient>, briefId: string) {
  const { data, error } = await admin
    .from("creative_briefs")
    .select("id, trigger_data, status, approved_at, visual_direction, copy_primary, copy_headline, copy_subtext, cta, hook, format")
    .eq("id", briefId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Creative brief not found")
  return data as CreativeBriefRow
}

async function processStaticBriefInner(
  admin: ReturnType<typeof createAdminClient>,
  options: ProcessStaticBriefOptions
) {
  const brief = await getBrief(admin, options.briefId)
  if (!brief.visual_direction?.trim()) throw new Error("Creative brief is missing visual_direction")

  const generator = briefGenerator(brief, options.generator)
  const generators = generatorsFor(generator)
  const requestedFormats = options.formats?.length ? options.formats : [normalizeFormat(brief.format) ?? "1x1"]
  const formats = Array.from(new Set(requestedFormats)).slice(0, 2)
  const requestedVariations = options.variations ?? 3
  const baseCount = countBaseImages(generators.length, formats.length, requestedVariations)
  let generated = 0

  await admin.from("creative_briefs").update({ status: "generating" }).eq("id", brief.id)

  for (const format of formats) {
    const baseImages = await generateLifestyleImage(brief.visual_direction, {
      generator,
      aspectRatio: aspectForFormat(format),
      count: baseCount as StaticVariationCount,
    })

    for (const baseImage of baseImages.slice(0, baseCount * generators.length)) {
      for (let variationIndex = 1; variationIndex <= requestedVariations; variationIndex++) {
        const variationLabel = VARIATION_LABELS[variationIndex - 1]
        const composite = await compositeStatic({
          baseImage: baseImage.buffer,
          format,
          variationLabel,
          copyPrimary: brief.copy_primary,
          copyHeadline: brief.copy_headline,
          copySubtext: brief.copy_subtext,
          cta: brief.cta,
        })
        const { gcsPath, gcsUrl } = await uploadCreativeAsset(
          composite,
          brief.id,
          format,
          `${baseImage.generationTool}_${baseImage.sourceIndex}_${variationLabel}`
        )

        const { error: insertError } = await admin.from("creative_assets").insert({
          brief_id: brief.id,
          asset_type: "image",
          generation_tool: baseImage.generationTool,
          variation_index: variationIndex,
          variation_label: variationLabel,
          format,
          gcs_path: gcsPath,
          gcs_url: gcsUrl,
          status: "generated",
          performance_data: {
            source_image_url: baseImage.sourceUrl ?? null,
            source_index: baseImage.sourceIndex,
            base_mime_type: baseImage.mimeType,
          },
        })
        if (insertError) throw insertError
        generated++
      }
    }
  }

  const { error: updateError } = await admin
    .from("creative_briefs")
    .update({ status: "variations_ready" })
    .eq("id", brief.id)
  if (updateError) throw updateError

  await sendReadyEmail(generated, brief)
  return generated
}

async function withBriefTimeout<T>(briefId: string, task: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Static generation timed out after 300s for brief ${briefId}`)), BRIEF_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function processStaticBrief(options: ProcessStaticBriefOptions) {
  const admin = createAdminClient()
  return withBriefTimeout(options.briefId, processStaticBriefInner(admin, options))
}

export async function generateStaticCreatives(options: {
  limit?: number
  briefIds?: string[]
  generator?: StaticGenerator
  formats?: StaticFormat[]
  variations?: StaticVariationCount
} = {}): Promise<StaticGenerationResult> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(options.limit ?? 1, 1), 1)
  let query = admin
    .from("creative_briefs")
    .select("id")
    .eq("status", "briefed")
    .not("approved_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (options.briefIds?.length) query = query.in("id", options.briefIds)

  const { data: briefs, error } = await query
  if (error) throw error

  const result: StaticGenerationResult = {
    processed: 0,
    generated: 0,
    queued: briefs?.length ?? 0,
    errors: [],
  }

  if (!briefs?.length) return result

  requireEnv("GCS_BUCKET_NAME")
  loadGoogleServiceAccountCredentials()

  for (const brief of (briefs ?? []) as Array<{ id: string }>) {
    result.processed++
    try {
      result.generated += await withBriefTimeout(
        brief.id,
        processStaticBriefInner(admin, {
          briefId: brief.id,
          generator: options.generator,
          formats: options.formats,
          variations: options.variations,
        })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown static generation error"
      result.errors.push({ briefId: brief.id, error: message })
      console.error("[static-generator] failed", { briefId: brief.id, error: err })
      await admin.from("creative_briefs").update({ status: "briefed" }).eq("id", brief.id)
    }
  }

  return result
}

export const staticGeneratorValidation = {
  normalizeGenerator,
  normalizeFormat,
  normalizeVariationCount,
}
