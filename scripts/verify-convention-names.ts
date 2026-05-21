/**
 * Lists composite-video assets missing convention_name.
 */
import { createClient } from "@supabase/supabase-js"

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )

  const { data, error } = await supabase
    .from("creative_assets")
    .select("id, variation_label, generation_tool, convention_name, status, created_at")
    .eq("generation_tool", "composite-video")
    .is("convention_name", null)
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!data?.length) {
    console.log("All video assets have convention_name set")
    return
  }

  console.log(`Found ${data.length} video assets without convention_name:`)
  for (const a of data) {
    console.log(`  ${a.id.slice(0, 8)}  ${a.variation_label ?? "—"}  status=${a.status}`)
  }
  console.log("\nThese will use legacy name-building on launch.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
