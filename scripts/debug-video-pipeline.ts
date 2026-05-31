#!/usr/bin/env npx tsx
import { loadEnvConfig } from "@next/env"

import { refreshCreativeAssetUrl } from "@/lib/agent/gcs"
import { createAdminClient } from "@/lib/supabase/admin"

loadEnvConfig(process.cwd())

async function main() {
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
    .select("id, brief_id, status, attempts, base_video_gcs_path, error_message, created_at")
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
