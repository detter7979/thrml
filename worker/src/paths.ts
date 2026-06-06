/** Unified creative path helpers (mirrors src/lib/agent/gcs-paths.ts for worker). */

function yyyy(d: Date): string {
  return d.getUTCFullYear().toString()
}

function mm(d: Date): string {
  return (d.getUTCMonth() + 1).toString().padStart(2, "0")
}

function slug(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase()
}

export function unifiedVideoRenderPath(args: {
  date: Date
  category: string
  angleSlug: string
  variantSlug: string
  templateVersion: number
}): string {
  const { date, category, angleSlug, variantSlug, templateVersion } = args
  return `${yyyy(date)}/${mm(date)}/${slug(category)}/${slug(angleSlug)}/Video/composite/${slug(variantSlug)}_9x16_v${templateVersion}.mp4`
}

export function angleSlugFromConcept(conceptSlug: string): string {
  return conceptSlug.replace(/-/g, "_")
}
