import { uploadCreativeAsset as uploadGcsCreativeAsset } from "@/lib/agent/gcs"
import {
  HOST_PROOF_SUBTEXT,
  matchesHostMonetizationPlaybook,
  parseStoredStaticVariations,
  type StoredStaticVariation,
  finalizeHostStaticImagePrompt,
  HOST_MONETIZATION_CANONICAL_VARIATIONS,
} from "@/lib/agent/host-monetization-static"
import { sendEmail, thrmlEmailWrapper, ctaButton } from "@/lib/emails/send"
import { generateImagen } from "@/lib/agent/imagen"
import { renderMasterAdTemplate } from "@/lib/agent/static-layouts/master-ad-template"
import { createAdminClient } from "@/lib/supabase/admin"

const CREATIVE_REVIEW_RECIPIENT = "etter.dom@gmail.com"
const MAX_IMAGE_GENERATIONS_PER_BRIEF = 12
const BRIEF_TIMEOUT_MS = 240_000
const VARIATION_LABELS = ["A", "B", "C"] as const
const DEFAULT_STATIC_VARIATION_COUNT: StaticVariationCount = 1

export type StaticGenerator = "imagen" | "replicate" | "both"
export type StaticFormat = "1x1" | "9x16"
export type StaticVariationCount = 1 | 2 | 3

type AspectRatio = "1:1" | "9:16"
type BaseImageGenerator = "imagen" | "replicate"

type CreativeBriefRow = {
  id: string
  trigger_type: string | null
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
  campaign_short_name: string | null
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
  copyPrimary?: string | null
  copyHeadline?: string | null
  copySubtext?: string | null
}

function resolveStaticVariationPlan(brief: CreativeBriefRow): StoredStaticVariation[] | null {
  const stored = parseStoredStaticVariations(brief.trigger_data)
  if (stored?.length) return stored.slice(0, 3)
  if (matchesHostMonetizationPlaybook(brief.trigger_data, brief.trigger_type)) {
    return HOST_MONETIZATION_CANONICAL_VARIATIONS.map((v) => ({
      variation_label: v.variation_label,
      headline: v.headline,
      background_image_prompt: finalizeHostStaticImagePrompt(v.background_image_prompt),
    }))
  }
  return null
}

function lockedSubtextForBrief(brief: CreativeBriefRow): string | null {
  if (matchesHostMonetizationPlaybook(brief.trigger_data, brief.trigger_type)) return HOST_PROOF_SUBTEXT
  return brief.copy_subtext?.trim() || null
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

function normalizeGenerator(value: unknown): StaticGenerator | null {
  return value === "imagen" || value === "replicate" || value === "both" ? value : null
}

function normalizeFormat(value: unknown): StaticFormat | null {
  return value === "1x1" || value === "9x16" ? value : null
}

function normalizeVariationCount(value: unknown): StaticVariationCount | null {
  return value === 1 || value === 2 || value === 3 ? value : null
}

function envVariationCount(name: string) {
  const value = Number(process.env[name])
  return Number.isInteger(value) ? normalizeVariationCount(value) : null
}

function defaultVariationCount() {
  return envVariationCount("CREATIVE_STATIC_VARIATIONS") ?? envVariationCount("CREATIVE_VARIATIONS") ?? DEFAULT_STATIC_VARIATION_COUNT
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

function countBaseImages(generatorCount: number, formatCount: number, requestedVariations: number) {
  const capPerPair = Math.floor(MAX_IMAGE_GENERATIONS_PER_BRIEF / Math.max(generatorCount * formatCount, 1))
  return Math.max(1, Math.min(requestedVariations, capPerPair))
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
  const trimmed = prompt.trim()
  const alreadyRich =
    /architectural photography/i.test(trimmed) &&
    /no text/i.test(trimmed) &&
    /no logos/i.test(trimmed)
  const tail = alreadyRich
    ? ", no watermarks"
    : ", photorealistic lifestyle ad creative, high-end architectural photography, warm editorial lighting, no text, no logos, no signage, no watermarks"
  const input = {
    prompt: `${trimmed}${tail}`,
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

export async function compositeStatic(opts: CompositeStaticOptions) {
  const headline = opts.copyHeadline?.trim() || opts.copyPrimary?.trim() || "Your private spa reset"
  const subhead = opts.copySubtext?.trim() || opts.copyPrimary?.trim() || ""

  return renderMasterAdTemplate({
    baseImage: opts.baseImage,
    format: opts.format,
    headline,
    subhead,
  })
}

export async function uploadCreativeAsset(buffer: Buffer, briefId: string, format: StaticFormat, variationLabel: string) {
  return uploadGcsCreativeAsset(buffer, {
    campaignShortName: briefId,
    briefId,
    kind: "static",
    filename: `static_${format}_${sanitizeFilename(variationLabel)}.png`,
    contentType: "image/png",
  })
}

async function sendReadyEmail(count: number, brief: CreativeBriefRow) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const reviewUrl = `${appUrl}/admin/paid-media`
  const subject = `${count} new creative variations ready for review — ${brief.hook ?? "Static creative"}`

  await sendEmail({
    to: CREATIVE_REVIEW_RECIPIENT,
    subject,
    html: thrmlEmailWrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
      <p style="color:#d4d4d4;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Static creative variations are ready for review in Paid Media (approval queue / campaigns).
      </p>
      ${ctaButton("Review creatives", reviewUrl)}
    `),
    text: `${subject}\n\nReview: ${reviewUrl}`,
  })
}

async function getBrief(admin: ReturnType<typeof createAdminClient>, briefId: string) {
  const { data, error } = await admin
    .from("creative_briefs")
    .select(
      "id, trigger_type, trigger_data, status, approved_at, visual_direction, copy_primary, copy_headline, copy_subtext, cta, hook, format, campaign_short_name",
    )
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
  const staticPlan = resolveStaticVariationPlan(brief)
  if (!staticPlan?.length && !brief.visual_direction?.trim()) {
    throw new Error("Creative brief is missing visual_direction")
  }

  const generator = briefGenerator(brief, options.generator)
  const generators = generatorsFor(generator)
  const requestedFormats = options.formats?.length ? options.formats : [normalizeFormat(brief.format) ?? "1x1"]
  const formats = Array.from(new Set(requestedFormats)).slice(0, 2)
  const requestedVariations = staticPlan?.length
    ? (Math.min(staticPlan.length, 3) as StaticVariationCount)
    : (options.variations ?? defaultVariationCount())
  const baseCount = countBaseImages(generators.length, formats.length, requestedVariations)
  const subtextLocked = lockedSubtextForBrief(brief)
  let generated = 0

  await admin.from("creative_briefs").update({ status: "generating" }).eq("id", brief.id)

  for (const format of formats) {
    if (staticPlan?.length) {
      const steps = staticPlan.slice(0, requestedVariations)
      for (const [i, step] of steps.entries()) {
        const baseImages = await generateLifestyleImage(step.background_image_prompt, {
          generator,
          aspectRatio: aspectForFormat(format),
          count: 1,
        })
        const baseImage =
          generators.length > 1
            ? baseImages.find((b) => b.generationTool === "replicate_mj") ?? baseImages[0]
            : baseImages[0]
        if (!baseImage) throw new Error("Static generation produced no base image")

        const variationIndex = i + 1
        const variationLabel = (step.variation_label || VARIATION_LABELS[i] || "A").toUpperCase().slice(0, 1)

        const composite = await compositeStatic({
          baseImage: baseImage.buffer,
          format,
          copyPrimary: brief.copy_primary,
          copyHeadline: step.headline,
          copySubtext: subtextLocked ?? brief.copy_subtext,
        })
        const { gcsPath, gcsUrl } = await uploadGcsCreativeAsset(composite, {
          campaignShortName: brief.campaign_short_name ?? brief.id,
          briefId: brief.id,
          kind: "static",
          filename: `static_${format}_${sanitizeFilename(`${baseImage.generationTool}_${baseImage.sourceIndex}_${variationLabel}`)}.png`,
          contentType: "image/png",
        })

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
            static_variation_headline: step.headline,
            static_variation_label: variationLabel,
          },
        })
        if (insertError) throw insertError
        generated++
      }
      continue
    }

    const baseImages = await generateLifestyleImage(brief.visual_direction!, {
      generator,
      aspectRatio: aspectForFormat(format),
      count: baseCount as StaticVariationCount,
    })

    const eligibleBaseImages = baseImages.slice(0, baseCount * generators.length)
    for (const [baseIndex, baseImage] of eligibleBaseImages.entries()) {
      const variationIndex = baseIndex + 1
      const variationLabel = VARIATION_LABELS[Math.min(baseIndex, VARIATION_LABELS.length - 1)]

      const composite = await compositeStatic({
        baseImage: baseImage.buffer,
        format,
        copyPrimary: brief.copy_primary,
        copyHeadline: brief.copy_headline,
        copySubtext: subtextLocked ?? brief.copy_subtext,
      })
      const { gcsPath, gcsUrl } = await uploadGcsCreativeAsset(composite, {
        campaignShortName: brief.campaign_short_name ?? brief.id,
        briefId: brief.id,
        kind: "static",
        filename: `static_${format}_${sanitizeFilename(`${baseImage.generationTool}_${baseImage.sourceIndex}_${variationLabel}`)}.png`,
        contentType: "image/png",
      })

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
    .in("status", ["approved", "briefed"])
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
