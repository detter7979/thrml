/**
 * Reformat pipeline rows already written to the namer Ad Builder tab.
 *
 * Usage: npx tsx scripts/repair-namer-rows.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import { repairSyncedNamerRows } from "@/lib/agent/namer-creative-append"

config({ path: ".env.local" })

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  const result = await repairSyncedNamerRows(admin)
  console.log(`Repaired ${result.repaired} row(s)`)
  if (result.errors.length) {
    console.log("Errors:")
    result.errors.forEach((e) => console.log(`  - ${e}`))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
