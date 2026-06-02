/**
 * Backfill approved creatives that were never synced to the namer sheet.
 *
 * Usage:
 *   npx tsx scripts/backfill-namer-creatives.ts
 *   npx tsx scripts/backfill-namer-creatives.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import { appendApprovedCreativeToNamer } from "@/lib/agent/namer-creative-append"

config({ path: ".env.local" })

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  const { data: assets, error } = await admin
    .from("creative_assets")
    .select("id, convention_name, approved_at, namer_synced_at")
    .eq("status", "approved")
    .is("namer_synced_at", null)
    .not("convention_name", "is", null)
    .order("approved_at", { ascending: true })

  if (error) throw error
  if (!assets?.length) {
    console.log("No approved assets pending namer sync.")
    return
  }

  console.log(`Found ${assets.length} asset(s) to sync`)
  for (const asset of assets) {
    console.log(`\n→ ${asset.id} (${asset.convention_name})`)
    if (dryRun) continue

    const result = await appendApprovedCreativeToNamer(admin, asset.id)
    console.log(JSON.stringify(result, null, 2))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
