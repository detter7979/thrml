#!/usr/bin/env npx tsx
import { loadEnvConfig } from "@next/env"

import { refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { createAdminClient } from "@/lib/supabase/admin"

loadEnvConfig(process.cwd())

async function retryFailedJob(jobId: string) {
  const admin = createAdminClient()
  const { data: job, error } = await admin
    .from("render_jobs")
    .select("id, brief_id, status, attempts, max_attempts, error_message")
    .eq("id", jobId)
    .maybeSingle()

  if (error || !job) {
    console.error("Job not found:", error?.message ?? jobId)
    process.exit(1)
  }

  if (job.status !== "failed") {
    console.error(`Job ${jobId} is ${job.status}, not failed`)
    process.exit(1)
  }

  const { error: jobUpdateError } = await admin
    .from("render_jobs")
    .update({
      status: "pending",
      attempts: 0,
      error_message: null,
      error_stack: null,
      completed_at: null,
      started_at: null,
      worker_id: null,
    })
    .eq("id", jobId)

  if (jobUpdateError) {
    console.error("Failed to reset job:", jobUpdateError.message)
    process.exit(1)
  }

  if (job.brief_id) {
    await admin.from("creative_briefs").update({ status: "generating" }).eq("id", job.brief_id)
  }

  console.log(`Reset job ${jobId} to pending (attempts cleared). Brief ${job.brief_id} -> generating`)
}

async function main() {
  const retryJobId = process.argv.includes("--retry-job")
    ? process.argv[process.argv.indexOf("--retry-job") + 1]
    : null

  if (retryJobId) {
    await retryFailedJob(retryJobId)
    return
  }

  const admin = createAdminClient()
  const { data: assets } = await admin
    .from("creative_assets")
    .select("id, brief_id, gcs_path, gcs_url, variation_label, generation_tool, status, created_at")
    .eq("asset_type", "video")
    .order("created_at", { ascending: false })
    .limit(10)

  console.log("Recent video assets:")
  for (const a of assets ?? []) {
    console.log("---")
    console.log(JSON.stringify(a, null, 2))
    if (a.gcs_path) {
      try {
        const url = await refreshCreativeAssetUrl(a.gcs_path)
        console.log("sign OK:", `${url.slice(0, 90)}...`)
      } catch (e) {
        console.log("sign FAIL:", e instanceof Error ? e.message : e)
      }
    }
  }

  const { data: jobs } = await admin
    .from("render_jobs")
    .select(
      "id, brief_id, status, attempts, max_attempts, template_version, variant_slug, base_video_gcs_path, error_message, rendered_gcs_path, created_at, completed_at"
    )
    .order("created_at", { ascending: false })
    .limit(10)

  console.log("\nRecent render jobs:")
  console.log(JSON.stringify(jobs, null, 2))

  const { data: briefs } = await admin
    .from("creative_briefs")
    .select("id, status, hook, video_config")
    .not("video_config", "is", null)
    .order("created_at", { ascending: false })
    .limit(8)

  console.log("\nRecent video briefs:")
  for (const b of briefs ?? []) {
    const vc = b.video_config as { source?: string; uploadedGcsPath?: string } | null
    console.log({
      id: b.id,
      status: b.status,
      hook: b.hook,
      source: vc?.source,
      uploadedGcsPath: vc?.uploadedGcsPath,
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
