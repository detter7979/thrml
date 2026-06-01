#!/usr/bin/env npx tsx
import { loadEnvConfig } from "@next/env"
import { createAdminClient } from "@/lib/supabase/admin"

loadEnvConfig(process.cwd())

async function main() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("creative_assets")
    .select("id, gcs_path, variation_label, format, performance_data, created_at")
    .order("created_at", { ascending: false })
    .limit(40)
  if (error) throw error
  for (const row of data ?? []) {
    if (row.gcs_path?.includes("pov_earnings") || row.gcs_path?.includes("A_9x16")) {
      console.log(JSON.stringify(row, null, 2))
    }
  }
}

main().catch(console.error)
