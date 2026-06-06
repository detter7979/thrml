#!/usr/bin/env npx tsx
/** Detailed QA dump for specific namer tabs. */
import { config } from "dotenv"

import { createGoogleSheetsClient, readSheetValues } from "@/lib/agent/google-sheets-client"
import { THRML_NAMER_V4_SHEET_ID } from "@/lib/agent/namer-creative-append"

config({ path: ".env.local" })

const SHEET_ID = process.env.NAMER_SHEET_ID?.trim() || THRML_NAMER_V4_SHEET_ID

async function dump(tab: string, range: string) {
  const sheets = createGoogleSheetsClient()
  const rows = await readSheetValues(sheets, SHEET_ID, tab, range)
  console.log(`\n=== ${tab} ${range} ===`)
  rows.forEach((row, i) => {
    if (!row.some((c) => String(c).trim())) return
    console.log(
      `r${i + 1}:`,
      row.map((c, j) => `${String.fromCharCode(65 + j)}:${String(c).trim()}`).join(" | ")
    )
  })
}

async function main() {
  await dump("Supabase Mapping", "A1:F60")
  await dump("Pending Approval", "A1:P15")
  await dump("Ad Builder", "A3:W8")
  await dump("Naming Convention", "A24:E34")
  await dump("README", "A4:B10")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
