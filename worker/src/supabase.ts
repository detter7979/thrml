import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Config } from "./config.js"

export interface RenderJob {
  id: string
  brief_id: string
  base_video_gcs_path: string
  variant_slug: string
  copy_text: string
  concept_slug: string
  template_version: number
  ad_name?: string | null
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  attempts: number
  max_attempts: number
}

export function makeSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

export async function claimNextJob(
  supabase: SupabaseClient,
  workerId: string
): Promise<RenderJob | null> {
  const { data, error } = await supabase.rpc("claim_render_job", {
    p_worker_id: workerId,
  })
  if (error) {
    throw new Error(
      `claim_render_job failed: ${error.message}${error.code ? ` (${error.code})` : ""}. ` +
        "Apply supabase/migrations/20260520120000_render_jobs.sql on production if this RPC is missing."
    )
  }
  if (!data) return null
  const rows = Array.isArray(data) ? data : [data]
  return rows.length > 0 ? (rows[0] as RenderJob) : null
}

export async function markCompleted(
  supabase: SupabaseClient,
  jobId: string,
  args: { renderedGcsPath: string; renderedAssetId: string; durationMs: number }
): Promise<void> {
  const { error } = await supabase
    .from("render_jobs")
    .update({
      status: "completed",
      rendered_gcs_path: args.renderedGcsPath,
      rendered_asset_id: args.renderedAssetId,
      duration_ms: args.durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
  if (error) throw error
}

export async function markFailed(
  supabase: SupabaseClient,
  jobId: string,
  args: { errorMessage: string; errorStack?: string; willRetry: boolean }
): Promise<void> {
  const { error } = await supabase
    .from("render_jobs")
    .update({
      status: args.willRetry ? "pending" : "failed",
      error_message: args.errorMessage,
      error_stack: args.errorStack,
      worker_id: null,
    })
    .eq("id", jobId)
  if (error) throw error
}

export async function insertCreativeAsset(
  supabase: SupabaseClient,
  config: Config,
  args: {
    briefId: string
    renderedGcsPath: string
    variantSlug: string
    conventionName: string | null
    sourceAssetId?: string
  }
): Promise<string> {
  const gcsPath = `gs://${config.GCS_CREATIVE_BUCKET}/${args.renderedGcsPath}`

  const { data, error } = await supabase
    .from("creative_assets")
    .insert({
      brief_id: args.briefId,
      asset_type: "video",
      generation_tool: "composite-video",
      variation_label: args.variantSlug,
      format: "9x16",
      gcs_path: gcsPath,
      gcs_url: null,
      status: "generated",
      source_asset_id: args.sourceAssetId ?? null,
      convention_name: args.conventionName,
    })
    .select("id")
    .single()

  if (error) throw error
  return data.id as string
}
