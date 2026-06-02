import { createAdminClient } from "@/lib/supabase/admin"

import { deleteCreativeObject, listCreativeAssetLibrary } from "./gcs"

export type CreativePurgeSummary = {
  briefsDeleted: number
  assetsDeleted: number
  renderJobsDeleted: number
  gcsDeleted: number
  gcsSkippedPreserved: number
  gcsFailed: number
  gcsPathsDeleted: string[]
  gcsPathsPreserved: string[]
}

export type DeleteCreativeBriefSummary = {
  briefId: string
  assetsDeleted: number
  renderJobsDeleted: number
  gcsDeleted: number
  gcsFailed: number
}

type AssetRow = {
  id?: string
  gcs_path: string | null
  performance_data: Record<string, unknown> | null
  launched_at?: string | null
  meta_ad_id?: string | null
}

type RenderJobRow = {
  rendered_gcs_path: string | null
}

/** Paths with "base" in the name — POV uploads, pre-overlay photos, legacy bases/ — never purged. */
export function isPreservedCreativeObjectPath(objectPath: string): boolean {
  const path = objectPath.replace(/^\/+/, "")
  return path.toLowerCase().includes("base")
}

/** Generated outputs safe to delete when resetting the creative pipeline. */
export function isGeneratedCreativeObjectPath(objectPath: string): boolean {
  if (isPreservedCreativeObjectPath(objectPath)) return false

  const path = objectPath.replace(/^\/+/, "")
  const lower = path.toLowerCase()

  if (/\/static\//i.test(path)) return true
  if (/\/video\//i.test(path)) return true
  if (lower.startsWith("renders/")) return true
  if (/^\d{4}-\d{2}\/[^/]+\/[0-9a-f-]{36}\/(statics|videos|references)\//i.test(path)) return true

  return false
}

function objectPathFromGcsRef(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = /^gs:\/\/[^/]+\/(.+)$/.exec(trimmed) ?? /^([^/]+\/.+)$/.exec(trimmed)
  return match ? match[1] ?? match[0] : trimmed
}

function collectGcsPathsFromAsset(asset: AssetRow, bucket: Set<string>) {
  if (asset.gcs_path) {
    const objectPath = objectPathFromGcsRef(asset.gcs_path)
    if (objectPath) bucket.add(objectPath)
  }

  const perf = asset.performance_data
  if (!perf || typeof perf !== "object") return

  for (const key of ["base_gcs_path", "source_image_url"] as const) {
    const raw = perf[key]
    if (typeof raw !== "string") continue
    const objectPath = objectPathFromGcsRef(raw)
    if (objectPath && !objectPath.startsWith("http")) bucket.add(objectPath)
  }
}

async function collectGeneratedGcsPaths(admin: ReturnType<typeof createAdminClient>) {
  const paths = new Set<string>()

  const [{ data: assets }, { data: jobs }] = await Promise.all([
    admin.from("creative_assets").select("gcs_path, performance_data"),
    admin.from("render_jobs").select("rendered_gcs_path"),
  ])

  for (const asset of (assets ?? []) as AssetRow[]) {
    collectGcsPathsFromAsset(asset, paths)
  }

  for (const job of (jobs ?? []) as RenderJobRow[]) {
    if (!job.rendered_gcs_path) continue
    const objectPath = objectPathFromGcsRef(job.rendered_gcs_path)
    if (objectPath) paths.add(objectPath)
  }

  const library = await listCreativeAssetLibrary({ mediaType: "all", limit: 1000 })
  for (const entry of library) {
    const objectPath = objectPathFromGcsRef(entry.gcsPath)
    if (objectPath && isGeneratedCreativeObjectPath(objectPath)) paths.add(objectPath)
  }

  return paths
}

async function unlinkCreativeQueueBrief(admin: ReturnType<typeof createAdminClient>, briefId: string) {
  const { error } = await admin.from("creative_queue").update({ brief_id: null }).eq("brief_id", briefId)
  if (error && !/creative_queue|does not exist|relation/i.test(error.message)) {
    throw new Error(error.message)
  }
}

async function unlinkCreativeQueueBriefs(admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.from("creative_queue").update({ brief_id: null }).not("brief_id", "is", null)
  if (error && !/creative_queue|does not exist|relation/i.test(error.message)) {
    throw new Error(error.message)
  }
}

function collectBriefGcsPaths(
  assets: AssetRow[],
  jobs: RenderJobRow[],
): { generated: string[]; preserved: string[] } {
  const paths = new Set<string>()
  for (const asset of assets) collectGcsPathsFromAsset(asset, paths)
  for (const job of jobs) {
    if (!job.rendered_gcs_path) continue
    const objectPath = objectPathFromGcsRef(job.rendered_gcs_path)
    if (objectPath) paths.add(objectPath)
  }

  const generated: string[] = []
  const preserved: string[] = []
  for (const objectPath of paths) {
    if (isPreservedCreativeObjectPath(objectPath)) preserved.push(objectPath)
    else if (isGeneratedCreativeObjectPath(objectPath)) generated.push(objectPath)
  }

  return { generated, preserved }
}

export async function deleteCreativeBrief(briefId: string): Promise<DeleteCreativeBriefSummary> {
  const admin = createAdminClient()

  const { data: brief, error: briefErr } = await admin
    .from("creative_briefs")
    .select("id")
    .eq("id", briefId)
    .maybeSingle()
  if (briefErr) throw new Error(briefErr.message)
  if (!brief) throw new Error("Brief not found")

  const [{ data: assets, error: assetsErr }, { data: jobs, error: jobsErr }] = await Promise.all([
    admin
      .from("creative_assets")
      .select("id, gcs_path, performance_data, launched_at, meta_ad_id")
      .eq("brief_id", briefId),
    admin.from("render_jobs").select("id, rendered_gcs_path").eq("brief_id", briefId),
  ])
  if (assetsErr) throw new Error(assetsErr.message)
  if (jobsErr) throw new Error(jobsErr.message)

  const assetRows = (assets ?? []) as AssetRow[]
  const jobRows = (jobs ?? []) as RenderJobRow[]

  const launched = assetRows.some((asset) => asset.launched_at || asset.meta_ad_id)
  if (launched) {
    throw new Error("Cannot delete brief with launched Meta ads. Pause or archive ads first.")
  }

  const { generated: gcsToDelete } = collectBriefGcsPaths(assetRows, jobRows)

  await unlinkCreativeQueueBrief(admin, briefId)

  const { error: parentError } = await admin
    .from("creative_briefs")
    .update({ parent_brief_id: null })
    .eq("parent_brief_id", briefId)
  if (parentError) throw new Error(parentError.message)

  const assetIds = assetRows.map((asset) => asset.id).filter(Boolean) as string[]
  if (assetIds.length > 0) {
    const { error: sourceError } = await admin
      .from("creative_assets")
      .update({ source_asset_id: null })
      .in("source_asset_id", assetIds)
    if (sourceError) throw new Error(sourceError.message)
  }

  const summary: DeleteCreativeBriefSummary = {
    briefId,
    assetsDeleted: assetRows.length,
    renderJobsDeleted: jobRows.length,
    gcsDeleted: 0,
    gcsFailed: 0,
  }

  for (const objectPath of gcsToDelete) {
    const deleted = await deleteCreativeObject(objectPath)
    if (deleted) summary.gcsDeleted += 1
    else summary.gcsFailed += 1
  }

  const { error: renderDeleteError } = await admin.from("render_jobs").delete().eq("brief_id", briefId)
  if (renderDeleteError) throw new Error(renderDeleteError.message)

  const { error: assetDeleteError } = await admin.from("creative_assets").delete().eq("brief_id", briefId)
  if (assetDeleteError) throw new Error(assetDeleteError.message)

  const { error: briefDeleteError } = await admin.from("creative_briefs").delete().eq("id", briefId)
  if (briefDeleteError) throw new Error(briefDeleteError.message)

  return summary
}

const DELETE_ALL_FILTER_ID = "00000000-0000-0000-0000-000000000000"

/** Explicit row deletes — prod FK on creative_assets.brief_id may lack ON DELETE CASCADE. */
async function deleteAllCreativePipelineRows(admin: ReturnType<typeof createAdminClient>) {
  await unlinkCreativeQueueBriefs(admin)

  const { error: parentError } = await admin
    .from("creative_briefs")
    .update({ parent_brief_id: null })
    .not("parent_brief_id", "is", null)
  if (parentError) throw new Error(parentError.message)

  const { error: sourceError } = await admin
    .from("creative_assets")
    .update({ source_asset_id: null })
    .not("source_asset_id", "is", null)
  if (sourceError) throw new Error(sourceError.message)

  const { error: jobsError } = await admin
    .from("render_jobs")
    .delete()
    .neq("id", DELETE_ALL_FILTER_ID)
  if (jobsError) throw new Error(jobsError.message)

  const { error: assetsError } = await admin
    .from("creative_assets")
    .delete()
    .neq("id", DELETE_ALL_FILTER_ID)
  if (assetsError) throw new Error(assetsError.message)

  const { error: briefsError } = await admin
    .from("creative_briefs")
    .delete()
    .neq("id", DELETE_ALL_FILTER_ID)
  if (briefsError) throw new Error(briefsError.message)
}

export async function purgeCreativePipeline(opts?: { dryRun?: boolean }): Promise<CreativePurgeSummary> {
  const dryRun = opts?.dryRun ?? false
  const admin = createAdminClient()

  const [{ count: assetCount }, { count: jobCount }, { count: briefCount }] = await Promise.all([
    admin.from("creative_assets").select("*", { count: "exact", head: true }),
    admin.from("render_jobs").select("*", { count: "exact", head: true }),
    admin.from("creative_briefs").select("*", { count: "exact", head: true }),
  ])

  const gcsPaths = await collectGeneratedGcsPaths(admin)
  const toDelete: string[] = []
  const preserved: string[] = []

  for (const objectPath of gcsPaths) {
    if (isPreservedCreativeObjectPath(objectPath)) preserved.push(objectPath)
    else toDelete.push(objectPath)
  }

  const summary: CreativePurgeSummary = {
    briefsDeleted: briefCount ?? 0,
    assetsDeleted: assetCount ?? 0,
    renderJobsDeleted: jobCount ?? 0,
    gcsDeleted: 0,
    gcsSkippedPreserved: preserved.length,
    gcsFailed: 0,
    gcsPathsDeleted: [],
    gcsPathsPreserved: preserved,
  }

  if (dryRun) {
    summary.gcsDeleted = toDelete.length
    summary.gcsPathsDeleted = toDelete.sort()
    return summary
  }

  for (const objectPath of toDelete) {
    const deleted = await deleteCreativeObject(objectPath)
    if (deleted) {
      summary.gcsDeleted += 1
      summary.gcsPathsDeleted.push(objectPath)
    } else {
      summary.gcsFailed += 1
    }
  }

  await deleteAllCreativePipelineRows(admin)

  return summary
}
