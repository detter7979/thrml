#!/usr/bin/env npx tsx
/**
 * Delete all creative briefs, assets, render jobs, and generated GCS files.
 * Preserves any GCS path with "base" in the name and bundled template assets.
 *
 *   npx tsx scripts/purge-creative-pipeline.ts --dry-run
 *   npx tsx scripts/purge-creative-pipeline.ts --confirm
 */
import { loadEnvConfig } from "@next/env"

import { purgeCreativePipeline } from "@/lib/agent/creative-pipeline-purge"

loadEnvConfig(process.cwd())

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const confirmed = process.argv.includes("--confirm")

  if (!dryRun && !confirmed) {
    console.error("Pass --dry-run to preview, or --confirm to execute the purge.")
    process.exit(1)
  }

  const summary = await purgeCreativePipeline({ dryRun })
  console.log(JSON.stringify(summary, null, 2))

  if (dryRun) {
    console.log("\nDry run only — re-run with --confirm to delete.")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
