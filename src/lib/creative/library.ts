/**
 * Creative library: every generated creative with its tags, a fresh preview link and (when it ran)
 * delivery numbers, plus a one-time move of older files into the year/persona/angle layout.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { copyCreativeObjectToVersionedPath, getSignedGcsReadUrl } from "@/lib/agent/gcs"
import { parseUnifiedPath, unifiedStaticBasePath, unifiedStaticPath } from "@/lib/agent/gcs-paths"

export const EDITABLE_TAGS = ["theme", "geo", "service", "persona", "angle", "cta"] as const
export type EditableTag = (typeof EDITABLE_TAGS)[number]

export type LibraryItem = {
  id: string
  name: string
  assetType: string
  format: string | null
  status: string
  year: string
  createdAt: string
  launchedAt: string | null
  persona: string | null
  angle: string | null
  theme: string | null
  cta: string | null
  geo: string | null
  service: string | null
  hook: string | null
  template: string | null
  adLegacyId: string | null
  tags: string[]
  gcsPath: string | null
  folder: string | null
  previewUrl: string | null
  briefStatus: string | null
  performance: { spend: number; impressions: number; clicks: number } | null
}

type AssetRow = {
  id: string
  brief_id: string | null
  asset_type: string | null
  format: string | null
  status: string | null
  convention_name: string | null
  gcs_path: string | null
  created_at: string
  launched_at: string | null
  persona: string | null
  angle: string | null
  theme: string | null
  cta: string | null
  geo: string | null
  service: string | null
  hook: string | null
  template: string | null
  ad_legacy_id: string | null
  tags: string[] | null
  performance_data: Record<string, unknown> | null
  variation_label: string | null
}

const ASSET_COLUMNS =
  "id, brief_id, asset_type, format, status, convention_name, gcs_path, created_at, launched_at, persona, angle, theme, cta, geo, service, hook, template, ad_legacy_id, tags, performance_data, variation_label"

function folderOf(gcsPath: string | null) {
  if (!gcsPath) return null
  const objectPath = gcsPath.replace(/^gs:\/\/[^/]+\//, "")
  return objectPath.split("/").slice(0, -1).join("/") || null
}

export async function loadCreativeLibrary(admin: SupabaseClient, opts: { limit?: number } = {}): Promise<LibraryItem[]> {
  const { data, error } = await admin
    .from("creative_assets")
    .select(ASSET_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 300)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as AssetRow[]

  const briefIds = [...new Set(rows.map((r) => r.brief_id).filter(Boolean))] as string[]
  const briefStatus = new Map<string, string>()
  if (briefIds.length) {
    const { data: briefs } = await admin.from("creative_briefs").select("id, status").in("id", briefIds)
    for (const b of (briefs ?? []) as Array<{ id: string; status: string }>) briefStatus.set(b.id, b.status)
  }

  // Delivery numbers for creatives linked to a namer ad that is live on a platform.
  const adIds = [...new Set(rows.map((r) => r.ad_legacy_id).filter(Boolean))] as string[]
  const perfByLegacy = new Map<string, { spend: number; impressions: number; clicks: number }>()
  if (adIds.length) {
    const { data: ads } = await admin.from("ads").select("legacy_id, platform_ad_id").in("legacy_id", adIds)
    const platformToLegacy = new Map<string, string>()
    for (const a of (ads ?? []) as Array<{ legacy_id: string; platform_ad_id: string | null }>) {
      if (a.platform_ad_id) platformToLegacy.set(a.platform_ad_id, a.legacy_id)
    }
    if (platformToLegacy.size) {
      const { data: daily } = await admin
        .from("report_platform_daily")
        .select("ad_id, spend, impressions, clicks")
        .eq("is_test", false)
        .in("ad_id", [...platformToLegacy.keys()])
      for (const d of (daily ?? []) as Array<{ ad_id: string; spend: number; impressions: number; clicks: number }>) {
        const legacy = platformToLegacy.get(d.ad_id)
        if (!legacy) continue
        const cur = perfByLegacy.get(legacy) ?? { spend: 0, impressions: 0, clicks: 0 }
        cur.spend += Number(d.spend ?? 0)
        cur.impressions += Number(d.impressions ?? 0)
        cur.clicks += Number(d.clicks ?? 0)
        perfByLegacy.set(legacy, cur)
      }
    }
  }

  // One signed link per stored file (several rows can share an old, overwritten path).
  const uniquePaths = [...new Set(rows.map((r) => r.gcs_path).filter(Boolean))] as string[]
  const signed = new Map<string, string | null>()
  await Promise.all(
    uniquePaths.map(async (p) => {
      try {
        signed.set(p, await getSignedGcsReadUrl(p.replace(/^gs:\/\/thrml-creative\//, `gs://${process.env.GCS_BUCKET_NAME}/`), { expiresInSec: 3600 }))
      } catch {
        signed.set(p, null)
      }
    })
  )

  return rows.map((r) => ({
    id: r.id,
    name: r.convention_name || `${r.template ?? "creative"}_${r.variation_label ?? ""}_${r.format ?? ""}`,
    assetType: r.asset_type ?? "image",
    format: r.format,
    status: r.status ?? "generated",
    year: r.created_at.slice(0, 4),
    createdAt: r.created_at,
    launchedAt: r.launched_at,
    persona: r.persona,
    angle: r.angle,
    theme: r.theme,
    cta: r.cta,
    geo: r.geo,
    service: r.service,
    hook: r.hook,
    template: r.template,
    adLegacyId: r.ad_legacy_id,
    tags: r.tags ?? [],
    gcsPath: r.gcs_path,
    folder: folderOf(r.gcs_path),
    previewUrl: r.gcs_path ? (signed.get(r.gcs_path) ?? null) : null,
    briefStatus: r.brief_id ? (briefStatus.get(r.brief_id) ?? null) : null,
    performance: r.ad_legacy_id ? (perfByLegacy.get(r.ad_legacy_id) ?? null) : null,
  }))
}

export async function updateCreativeTags(
  admin: SupabaseClient,
  id: string,
  patch: Partial<Record<EditableTag, string | null>> & { tags?: string[] }
) {
  const clean: Record<string, unknown> = {}
  for (const key of EDITABLE_TAGS) {
    if (key in patch) {
      const v = patch[key]
      const trimmed = typeof v === "string" ? v.trim() : ""
      clean[key] = trimmed ? (key === "geo" ? trimmed.toUpperCase() : trimmed.toLowerCase()) : null
    }
  }
  if (patch.tags) {
    clean.tags = [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)
  }
  if (!Object.keys(clean).length) return
  const { error } = await admin.from("creative_assets").update(clean).eq("id", id)
  if (error) throw new Error(error.message)
}

/** New-layout object path for an older {year}/{month}/... file, or null when it's already in place. */
export function libraryPathFor(
  gcsPath: string,
  info: { name: string | null; variant: string; format: string | null; template: string | null; stage?: "base" | "composite" }
): string | null {
  const parsed = parseUnifiedPath(gcsPath)
  if (!parsed?.month || !parsed.year || !parsed.category || !parsed.angle) return null
  const date = new Date(`${parsed.year}-01-01T00:00:00Z`)
  const ext = (parsed.filename?.split(".").pop() ?? "png").toLowerCase()
  if (parsed.mediaType === "Static") {
    const args = {
      date,
      category: parsed.category,
      angleSlug: parsed.angle,
      variant: info.variant,
      format: (info.format ?? "1x1") as "1x1" | "9x16" | "4x5",
      ext,
      templateSlug: info.template ?? undefined,
      name: info.name ?? undefined,
    }
    return (info.stage ?? parsed.assetStage) === "base" ? unifiedStaticBasePath(args) : unifiedStaticPath(args)
  }
  return `${parsed.year}/${parsed.category}/${parsed.angle}/${parsed.mediaType}/${parsed.assetStage ? `${parsed.assetStage}/` : ""}${parsed.filename}`
}

export type ReorganizeResult = { moved: number; alreadyInPlace: number; failed: Array<{ id: string; error: string }> }

/**
 * Copies older files into the library layout and repoints the records. Originals stay where they are.
 * Rows with the same file and the same ad name share one copy.
 */
export async function reorganizeCreativeLibrary(admin: SupabaseClient): Promise<ReorganizeResult> {
  const { data, error } = await admin.from("creative_assets").select(ASSET_COLUMNS).order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as AssetRow[]
  const copied = new Map<string, { gcsPath: string; gcsUrl: string }>()
  const result: ReorganizeResult = { moved: 0, alreadyInPlace: 0, failed: [] }

  const copyOnce = async (src: string, dst: string) => {
    const key = `${src}|${dst}`
    const hit = copied.get(key)
    if (hit) return hit
    const out = await copyCreativeObjectToVersionedPath(src, dst)
    const v = { gcsPath: out.gcsPath, gcsUrl: out.gcsUrl }
    copied.set(key, v)
    return v
  }

  for (const r of rows) {
    if (!r.gcs_path) continue
    const variant = (r.variation_label ?? "A").toUpperCase().slice(0, 1)
    const dst = libraryPathFor(r.gcs_path, { name: r.convention_name, variant, format: r.format, template: r.template })
    if (!dst) {
      result.alreadyInPlace += 1
      continue
    }
    try {
      const composite = await copyOnce(r.gcs_path, dst)
      const perf = { ...(r.performance_data ?? {}) }
      const base = typeof perf.base_gcs_path === "string" ? perf.base_gcs_path : null
      if (base) {
        const baseDst = libraryPathFor(base, { name: r.convention_name, variant, format: r.format, template: r.template, stage: "base" })
        if (baseDst) {
          try {
            perf.previous_base_gcs_path = base
            perf.base_gcs_path = (await copyOnce(base, baseDst)).gcsPath
          } catch {
            // Base photo missing: keep the old pointer; the composite still moves.
          }
        }
      }
      perf.previous_gcs_path = r.gcs_path
      const { error: upErr } = await admin
        .from("creative_assets")
        .update({ gcs_path: composite.gcsPath, gcs_url: composite.gcsUrl, performance_data: perf })
        .eq("id", r.id)
      if (upErr) throw new Error(upErr.message)
      result.moved += 1
    } catch (e) {
      result.failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
