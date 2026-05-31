#!/usr/bin/env npx tsx
/**
 * List video objects in main + creative GCS buckets (helps find test uploads).
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON=... GCS_BUCKET_NAME=... GCS_CREATIVE_BUCKET=... \
 *     npx tsx scripts/list-creative-gcs-videos.ts
 */
import { loadEnvConfig } from "@next/env"

import { listCreativeAssetLibrary } from "@/lib/agent/gcs"
import { parseUnifiedPath } from "@/lib/agent/gcs-paths"
import {
  resolveCreativeBucketName,
  suggestedT4BaseVideoGsUri,
  suggestedT4BaseVideoObjectPath,
} from "@/lib/agent/t4-base-video-upload"

loadEnvConfig(process.cwd())

function scheme(path: string): string {
  if (path.startsWith("bases/")) return "legacy-base"
  if (path.startsWith("renders/")) return "legacy-render"
  if (/^\d{4}-\d{2}\//.test(path)) return "legacy-brief-month"
  if (path.startsWith("thrml-creative/")) return "path-prefix"
  if (parseUnifiedPath(path)) return "unified"
  return "other"
}

async function main() {
  const mainBucket = process.env.GCS_BUCKET_NAME ?? "(GCS_BUCKET_NAME not set)"
  const creativeBucket = resolveCreativeBucketName(mainBucket)
  const pathPrefix = (process.env.GCS_PATH_PREFIX ?? "").trim()

  console.log("Configured buckets")
  console.log(`  main:     ${mainBucket}`)
  console.log(`  creative: ${creativeBucket}${creativeBucket === mainBucket ? " (same as main — GCS_CREATIVE_BUCKET unset)" : ""}`)
  if (pathPrefix) {
    console.log(`  path prefix (legacy brief uploads on main bucket): ${pathPrefix}/`)
  }
  console.log("")
  console.log("Note: gs://thrml-creative/ is NOT a bucket in this project unless you create it.")
  console.log("      Older docs/UI used that name; your env uses bucket thrml only.")
  console.log("")
  console.log("Canonical T4 base path (upload new files here)")
  console.log(`  ${suggestedT4BaseVideoGsUri(creativeBucket)}`)
  console.log(`  object: ${suggestedT4BaseVideoObjectPath()}`)
  console.log("")

  const assets = await listCreativeAssetLibrary({ mediaType: "video", limit: 500 })

  if (assets.length === 0) {
    console.log("No video objects found in either bucket.")
    return
  }

  const byScheme = new Map<string, typeof assets>()
  for (const asset of assets) {
    const key = `${asset.bucket}:${scheme(asset.name)}`
    const group = byScheme.get(key) ?? []
    group.push(asset)
    byScheme.set(key, group)
  }

  console.log(`Found ${assets.length} video object(s):\n`)

  for (const [key, group] of [...byScheme.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`── ${key} (${group.length}) ──`)
    for (const asset of group) {
      console.log(`  gs://${asset.bucket === "main" ? mainBucket : creativeBucket}/${asset.name}`)
      if (asset.createdAt) console.log(`    created: ${asset.createdAt}`)
    }
    console.log("")
  }

  console.log("Cleanup tip: move test files under _archive/ prefix, e.g.")
  console.log(`  gsutil mv gs://${mainBucket}/2026-05/OLD_BRIEF_ID/ gs://${mainBucket}/_archive/2026-05/OLD_BRIEF_ID/`)
  console.log(`  gsutil mv gs://${mainBucket}/bases/... gs://${mainBucket}/_archive/bases/...`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
