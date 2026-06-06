#!/usr/bin/env npx tsx
/**
 * Write auto-name formulas to Campaign / Ad Set / Ad Builder tabs (USER_ENTERED).
 *
 *   npx tsx scripts/apply-namer-formulas.ts
 *   npx tsx scripts/apply-namer-formulas.ts --allocate-ad-ids
 */
import { config } from "dotenv"

import { THRML_NAMER_V4_SHEET_ID } from "@/lib/agent/namer-creative-append"
import { applyAllNamerFormulas } from "@/lib/agent/namer-sheet-formulas-apply"

config({ path: ".env.local" })

const SHEET_ID = process.env.NAMER_SHEET_ID?.trim() || THRML_NAMER_V4_SHEET_ID

async function main() {
  const allocateAdIds = process.argv.includes("--allocate-ad-ids")
  console.log(`Applying formulas to sheet ${SHEET_ID} ...`)
  const results = await applyAllNamerFormulas(SHEET_ID, { allocateAdIds })
  for (const r of results) {
    console.log(
      `${r.tab}: column ${r.autoNameCol}, ${r.rowsUpdated} formula(s)` +
        (r.adIdsAllocated ? `, ${r.adIdsAllocated} Ad ID(s) allocated` : "")
    )
  }
  console.log("\nDone. Refresh the Google Sheet to see computed names.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
