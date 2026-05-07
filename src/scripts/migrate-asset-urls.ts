import { normalizeCreativeAssetGcsPath, refreshCreativeAssetUrl } from "../lib/agent/gcs"
import { createAdminClient } from "../lib/supabase/admin"

type CreativeAssetRow = {
  id: string
  gcs_path: string | null
  gcs_url: string | null
}

async function migrateAssetUrls() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("creative_assets")
    .select("id, gcs_path, gcs_url")
    .like("gcs_url", "https://storage.googleapis.com%")

  if (error) throw error

  const assets = (data ?? []) as CreativeAssetRow[]
  let updated = 0

  for (const asset of assets) {
    if (!asset.gcs_path) {
      console.warn(`Skipping ${asset.id}: missing gcs_path`)
      continue
    }

    const normalizedGcsPath = normalizeCreativeAssetGcsPath(asset.gcs_path)
    const gcsUrl = await refreshCreativeAssetUrl(normalizedGcsPath)
    const { error: updateError } = await admin
      .from("creative_assets")
      .update({ gcs_path: normalizedGcsPath, gcs_url: gcsUrl })
      .eq("id", asset.id)

    if (updateError) throw updateError
    updated += 1
    console.log(`Updated ${asset.id}`)
  }

  console.log(`Refreshed ${updated} creative asset URL${updated === 1 ? "" : "s"}.`)
}

migrateAssetUrls().catch((err) => {
  console.error(err)
  process.exit(1)
})
