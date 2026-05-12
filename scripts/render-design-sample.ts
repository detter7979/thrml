import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { loadEnvConfig } from "@next/env"

import {
  renderMasterAdTemplate,
  type MasterAdTemplateFormat,
} from "@/lib/agent/static-layouts/master-ad-template"
import {
  HOST_MONETIZATION_CANONICAL_VARIATIONS,
  HOST_PROOF_SUBTEXT,
} from "@/lib/agent/host-monetization-static"

type Sample = {
  format: MasterAdTemplateFormat
  filename: string
  headline: string
  subhead: string
}

const ROOT = path.resolve(__dirname, "..")
loadEnvConfig(ROOT)

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

async function generateBaseFromReplicate(prompt: string, aspectRatio: string): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured")
  const model = process.env.REPLICATE_STATIC_MODEL ?? "black-forest-labs/flux-schnell"

  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        prompt: `${prompt}, photorealistic lifestyle ad creative, warm editorial lighting, no text, no logos, no signage, no watermarks`,
        aspect_ratio: aspectRatio,
        num_outputs: 1,
        output_format: "png",
      },
    }),
  })

  if (!res.ok) throw new Error(`Replicate request failed (${res.status}): ${(await readError(res)).slice(0, 500)}`)
  const payload = (await res.json()) as Record<string, unknown>
  const urls = extractReplicateUrls(payload)
  if (urls.length === 0) throw new Error("Replicate response did not include any output URLs")

  const dl = await fetch(urls[0])
  if (!dl.ok) throw new Error(`Base image download failed (${dl.status})`)
  return Buffer.from(await dl.arrayBuffer())
}

async function getBaseImage(format: MasterAdTemplateFormat, prompt: string): Promise<Buffer> {
  const cachedPath = path.join(ROOT, `.tmp/design-sample-base-${format}.png`)
  if (existsSync(cachedPath)) {
    console.log(`Reusing cached base image ${cachedPath}`)
    return readFile(cachedPath)
  }

  const aspectRatio = format === "9x16" ? "9:16" : format === "4x5" ? "4:5" : "1:1"
  console.log(`Generating fresh clean ${format} base image via Replicate Flux...`)
  const buffer = await generateBaseFromReplicate(prompt, aspectRatio)
  await mkdir(path.dirname(cachedPath), { recursive: true })
  await writeFile(cachedPath, buffer)
  console.log(`Cached base image at ${cachedPath}`)
  return buffer
}

const HOST_ACQUISITION_BASE_PROMPT =
  "Photorealistic owner POV looking down at a thriving private cedar sauna and cold plunge nestled in a lush manicured backyard at golden hour, premium architectural detail, warm editorial lighting"

const SAMPLES: Sample[] = [
  {
    format: "1x1",
    filename: "design-sample-1x1.png",
    headline: "Your private spa reset",
    subhead: HOST_PROOF_SUBTEXT,
  },
  {
    format: "9x16",
    filename: "design-sample-9x16.png",
    headline: "Your backyard sauna can pay for itself",
    subhead: HOST_PROOF_SUBTEXT,
  },
]

async function main() {
  const outDir = path.join(ROOT, ".tmp")
  await mkdir(outDir, { recursive: true })

  for (const sample of SAMPLES) {
    const baseImage = await getBaseImage(sample.format, HOST_ACQUISITION_BASE_PROMPT)
    const composite = await renderMasterAdTemplate({
      baseImage,
      format: sample.format,
      headline: sample.headline,
      subhead: sample.subhead,
    })
    const outPath = path.join(outDir, sample.filename)
    await writeFile(outPath, composite)
    console.log(`Rendered ${outPath}`)
  }

  // Same Master Ad overlay (gradient + thrml + headline + proof subhead) for
  // all three canonical host-monetization headlines — one shared 9:16 base.
  const base9 = await getBaseImage("9x16", HOST_ACQUISITION_BASE_PROMPT)
  for (const v of HOST_MONETIZATION_CANONICAL_VARIATIONS) {
    const composite = await renderMasterAdTemplate({
      baseImage: base9,
      format: "9x16",
      headline: v.headline,
      subhead: HOST_PROOF_SUBTEXT,
    })
    const outPath = path.join(outDir, `design-sample-host-${v.variation_label}-9x16.png`)
    await writeFile(outPath, composite)
    console.log(`Rendered ${outPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
