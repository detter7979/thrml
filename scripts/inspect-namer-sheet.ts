#!/usr/bin/env npx tsx
import { config } from "dotenv"

import {
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import { findCreativeBuilderHeader } from "@/lib/agent/namer-creative-append"
import { THRML_NAMER_V4_SHEET_ID } from "@/lib/agent/namer-creative-append"
import { NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"

config({ path: ".env.local" })

const SHEET_ID = process.env.NAMER_SHEET_ID?.trim() || THRML_NAMER_V4_SHEET_ID

async function main() {
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, SHEET_ID)
  console.log("Tabs:", tabs.join(" | "))

  for (const kind of ["campaign", "ad_set", "ad"] as const) {
    const tab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES[kind])
    if (!tab) {
      console.log(`\n[${kind}] tab NOT FOUND`)
      continue
    }
    const rows = await readSheetValues(sheets, SHEET_ID, tab, "A1:ZZ30")
    console.log(`\n=== ${tab} (${kind}) ===`)
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const line = rows[r] ?? []
      if (line.some((c) => c.trim())) {
        console.log(`row ${r + 1}:`, line.map((c, i) => `${String.fromCharCode(65 + i)}:${c}`).join(" | "))
      }
    }
    if (kind === "ad") {
      const header = findCreativeBuilderHeader(rows)
      console.log("detected layout:", header)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
