#!/usr/bin/env npx tsx
/**
 * Backfill Token Library from approved creatives (ANGLE / CTA / FORMAT).
 * Safe to re-run — skips values already present.
 *
 * Usage:
 *   npx tsx scripts/sync-namer-token-library.ts
 *   npx tsx scripts/sync-namer-token-library.ts --asset-id UUID
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import {
  buildNamerCreativeRow,
  resolveNamerSheetId,
} from "@/lib/agent/namer-creative-append"
import { syncPipelineTokensToTokenLibrary } from "@/lib/agent/namer-token-library-sync"

config({ path: ".env.local" })

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const assetIdArg = process.argv.find((a) => a.startsWith("--asset-id="))?.split("=")[1]?.trim()
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )
  const sheetId = await resolveNamerSheetId(admin)
  if (!sheetId) throw new Error("NAMER_SHEET_ID not configured")

  let query = admin
    .from("creative_assets")
    .select("id, convention_name, brief_id")
    .eq("status", "approved")
    .not("convention_name", "is", null)
    .order("approved_at", { ascending: true })

  if (assetIdArg) query = query.eq("id", assetIdArg)

  const { data: assets, error } = await query
  if (error) throw error
  if (!assets?.length) {
    console.log("No approved assets with convention_name.")
    return
  }

  let totalAdded = 0
  for (const asset of assets) {
    const { data: brief } = await admin
      .from("creative_briefs")
      .select("id, trigger_type, trigger_data, created_by, hook, copy_headline, hypothesis, campaign_short_name")
      .eq("id", asset.brief_id)
      .maybeSingle()

    const row = buildNamerCreativeRow(
      {
        id: asset.id,
        brief_id: asset.brief_id,
        convention_name: asset.convention_name,
        gcs_path: null,
        gcs_url: null,
        format: null,
        meta_ad_id: null,
        meta_adset_id: null,
        namer_synced_at: null,
      },
      brief ?? {
        id: asset.brief_id ?? "",
        trigger_type: null,
        trigger_data: null,
        created_by: null,
        hook: null,
        copy_headline: null,
      },
      { campaignGen: "Pending", adSetGen: "Pending" },
      { gcsPath: "", signedUrl: "" },
      "ad_builder"
    )

    if (!row) {
      console.log(`Skip ${asset.id}: could not parse convention_name`)
      continue
    }

    const result = await syncPipelineTokensToTokenLibrary(sheetId, row, brief ?? undefined)
    if (result.added.length) {
      totalAdded += result.added.length
      console.log(
        asset.id,
        "added:",
        result.added.map((t) => `${t.category}:${t.value}`).join(", ")
      )
    }
  }

  console.log(`Done. ${totalAdded} token(s) added across ${assets.length} asset(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
