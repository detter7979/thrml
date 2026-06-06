#!/usr/bin/env npx tsx
/**
 * Dedupe thrml_namer_v4 tabs and migrate Ad Builder headers (Platform * columns).
 *
 *   npx tsx scripts/cleanup-namer-sheets.ts --dry-run
 *   npx tsx scripts/cleanup-namer-sheets.ts --confirm
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import {
  dedupeAllNamerTabs,
  migrateAdBuilderHeaderLabels,
} from "@/lib/agent/namer-sheet-cleanup"

config({ path: ".env.local" })

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const confirmed = process.argv.includes("--confirm")
  if (!dryRun && !confirmed) {
    console.error("Pass --dry-run to preview, or --confirm to apply changes.")
    process.exit(1)
  }

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  console.log("\n=== Header migration (Ad Builder) ===")
  const header = await migrateAdBuilderHeaderLabels(admin, { dryRun })
  console.log(header.changes.length ? header.changes.join("\n") : "No header changes needed.")

  console.log("\n=== Dedupe tabs ===")
  const results = await dedupeAllNamerTabs(admin, { dryRun })
  for (const r of results) {
    console.log(
      `${r.tab}: ${r.rowsBefore} → ${r.rowsAfter} rows (${r.duplicatesRemoved} duplicates${dryRun ? " would be" : ""} removed)`
    )
    if (r.removedPreview.length) {
      console.log("  sample removed:", r.removedPreview.map((row) => row.slice(0, 4).join(" | ")).join("\n  "))
    }
  }

  if (dryRun) {
    console.log("\nDry run only — re-run with --confirm to apply.")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
