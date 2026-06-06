#!/usr/bin/env npx tsx
/** Dump all namer tabs for QA review. */
import { config } from "dotenv"

import {
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
} from "@/lib/agent/google-sheets-client"
import { THRML_NAMER_V4_SHEET_ID } from "@/lib/agent/namer-creative-append"

config({ path: ".env.local" })

const SHEET_ID = process.env.NAMER_SHEET_ID?.trim() || THRML_NAMER_V4_SHEET_ID

const SKIP_DEEP = new Set(["Campaign Builder", "Ad Set Builder", "Ad Builder"])

async function main() {
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, SHEET_ID)
  console.log("Sheet:", SHEET_ID)
  console.log("Tabs:", tabs.length, "\n")

  for (const tab of tabs) {
    const rows = await readSheetValues(sheets, SHEET_ID, tab, "A1:ZZ80")
    const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim()))
    console.log(`\n${"=".repeat(60)}`)
    console.log(`TAB: ${tab} (${nonEmpty.length} non-empty rows)`)
    console.log("=".repeat(60))
    const limit = SKIP_DEEP.has(tab) ? 6 : Math.min(nonEmpty.length, 25)
    for (let r = 0; r < limit; r++) {
      const line = rows[r] ?? []
      if (!line.some((c) => String(c).trim())) continue
      const preview = line
        .slice(0, 12)
        .map((c, i) => {
          const v = String(c).trim()
          if (!v) return ""
          const short = v.length > 48 ? `${v.slice(0, 45)}…` : v
          return `${String.fromCharCode(65 + i)}:${short}`
        })
        .filter(Boolean)
        .join(" | ")
      if (preview) console.log(`  r${r + 1}: ${preview}`)
    }
    if (!SKIP_DEEP.has(tab) && nonEmpty.length > limit) {
      console.log(`  … +${nonEmpty.length - limit} more rows`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
