#!/usr/bin/env npx tsx
/**
 * Batch-edit T1 static composites by GCS path (in-place overwrite).
 *
 *   npx tsx scripts/edit-static-photo-batch.ts
 */
import { loadEnvConfig } from "@next/env"

import { editStaticPhotoByGcsPath, findLatestAssetByGcsPath } from "@/lib/agent/static-photo-recomposite"

loadEnvConfig(process.cwd())

const JOBS = [
  {
    gcsPath: "gs://thrml/2026/05/hosts/pov_earnings/Static/A_9x16.png",
    edit: "flip horizontal, remove blurred deck railing in foreground",
  },
  {
    gcsPath: "gs://thrml/2026/05/hosts/pov_earnings/Static/A_1x1.png",
    edit: "remove blurred foreground deck railing and distractions, keep cedar sauna exterior sharp",
  },
  {
    gcsPath: "gs://thrml/2026/05/hosts/pov_earnings/Static/C_1x1.png",
    edit: "remove the blurred dumbbells and other blurred foreground gym props",
  },
] as const

async function main() {
  for (const job of JOBS) {
    console.log(`\n[batch] ${job.gcsPath}`)
    const asset = await findLatestAssetByGcsPath(job.gcsPath)
    if (!asset) {
      console.error(`  ✗ No DB asset for ${job.gcsPath}`)
      continue
    }
    console.log(`  asset ${asset.id} · ${asset.variation_label} · ${asset.format}`)
    const perf = asset.performance_data as Record<string, unknown> | null
    if (perf?.static_variation_headline) console.log(`  headline: ${perf.static_variation_headline}`)

    const result = await editStaticPhotoByGcsPath(job.gcsPath, job.edit, { replaceInPlace: true })
    console.log(`  ✓ ${result.editSummary}`)
    console.log(`  → ${result.compositeGcsPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
