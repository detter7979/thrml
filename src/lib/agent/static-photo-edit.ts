import sharp from "sharp"

export type PhotoGeometricEdit = {
  rotate?: 90 | 180 | 270
  flipHorizontal?: boolean
  flipVertical?: boolean
}

export type ApplyPhotoEditsOptions = {
  geometric?: PhotoGeometricEdit
  /** Natural-language cleanup (e.g. remove blurred foreground props). Requires Replicate. */
  semanticPrompt?: string | null
}

const DEFAULT_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function readError(res: Response) {
  const text = await res.text()
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    return text
  }
}

function extractReplicateUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const output = (payload as Record<string, unknown>).output
  if (typeof output === "string") return output
  if (Array.isArray(output) && typeof output[0] === "string") return output[0]
  return null
}

/** Parse flip/rotate hints from a natural-language edit prompt. */
export function parsePhotoEditInstructions(prompt: string): {
  geometric: PhotoGeometricEdit
  semanticPrompt: string | null
} {
  const raw = prompt.trim()
  if (!raw) return { geometric: {}, semanticPrompt: null }

  const lower = raw.toLowerCase()
  const geometric: PhotoGeometricEdit = {}

  if (/\b(flip\s*180|rotate\s*180|180\s*degrees?)\b/.test(lower)) {
    geometric.rotate = 180
  } else if (/\brotate\s*270\b/.test(lower)) {
    geometric.rotate = 270
  } else if (/\brotate\s*90\b/.test(lower)) {
    geometric.rotate = 90
  }

  if (/\bflip\s*horizontal\b/.test(lower) || /\bmirror\s*horizontal\b/.test(lower)) {
    geometric.flipHorizontal = true
  }
  if (/\bflip\s*vertical\b/.test(lower)) {
    geometric.flipVertical = true
  }
  if (/\bflip\b/.test(lower) && !geometric.rotate && !geometric.flipHorizontal && !geometric.flipVertical) {
    geometric.rotate = 180
  }

  let semantic = raw
    .replace(/\b(flip|rotate|mirror)\s*(180|90|270|horizontal|vertical|degrees?)?\b/gi, " ")
    .replace(/\b(and then|then)\b/gi, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  return {
    geometric,
    semanticPrompt: semantic.length > 8 ? semantic : null,
  }
}

export async function applyGeometricPhotoEdit(buffer: Buffer, edit: PhotoGeometricEdit): Promise<Buffer> {
  let pipeline = sharp(buffer)
  if (edit.rotate) pipeline = pipeline.rotate(edit.rotate)
  if (edit.flipHorizontal) pipeline = pipeline.flop()
  if (edit.flipVertical) pipeline = pipeline.flip()
  return pipeline.png().toBuffer()
}

function bufferToDataUri(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`
}

function buildSemanticEditPrompt(userPrompt: string) {
  const trimmed = userPrompt.trim()
  return `${trimmed}. Keep the scene photorealistic and editorial. Do not add text, logos, watermarks, or people. Preserve lighting and material texture unless the edit requires changing them.`
}

export async function editPhotoSemantically(buffer: Buffer, userPrompt: string): Promise<Buffer> {
  const token = requireEnv("REPLICATE_API_TOKEN")
  const model = process.env.REPLICATE_PHOTO_EDIT_MODEL?.trim() || DEFAULT_KONTEXT_MODEL
  const prompt = buildSemanticEditPrompt(userPrompt)

  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_image: bufferToDataUri(buffer),
        aspect_ratio: "match_input_image",
        output_format: "png",
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Replicate photo edit failed (${res.status}): ${(await readError(res)).slice(0, 500)}`)
  }

  const payload = (await res.json()) as Record<string, unknown>
  const url = extractReplicateUrl(payload)
  if (!url) throw new Error("Replicate photo edit returned no output URL")

  const download = await fetch(url)
  if (!download.ok) throw new Error(`Photo edit download failed (${download.status})`)
  return Buffer.from(await download.arrayBuffer())
}

export async function applyPhotoEdits(buffer: Buffer, opts: ApplyPhotoEditsOptions): Promise<Buffer> {
  let working = buffer
  if (opts.geometric && Object.keys(opts.geometric).length > 0) {
    working = await applyGeometricPhotoEdit(working, opts.geometric)
  }
  if (opts.semanticPrompt?.trim()) {
    working = await editPhotoSemantically(working, opts.semanticPrompt.trim())
  }
  return working
}

export async function applyPhotoEditPrompt(buffer: Buffer, editPrompt: string): Promise<Buffer> {
  const parsed = parsePhotoEditInstructions(editPrompt)
  return applyPhotoEdits(buffer, {
    geometric: parsed.geometric,
    semanticPrompt: parsed.semanticPrompt,
  })
}
