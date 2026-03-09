// ============================================================
// link-listing-photos.mjs
// node --env-file=.env.local link-listing-photos.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'listing-images' // ← correct bucket

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const LISTING_IDS = [
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8001',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8002',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8003',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8004',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8005',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8006',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8007',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8008',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8009',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8010',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8011',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8012',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8013',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8014',
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8015',
  '28d58831-ab82-46ab-a189-3cfe1eb2426c',
  'e0f7a21d-539b-406c-8fec-82891001336c',
  'ea6c817e-ef1a-4f11-8d60-5c247eca321d',
]

async function linkPhotos() {
  console.log(`\nReading from bucket: ${BUCKET}\n`)

  let totalInserted = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const listingId of LISTING_IDS) {
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(listingId, { limit: 50, sortBy: { column: 'name', order: 'asc' } })

    if (error) {
      console.log(`  ✗  ${listingId} — ${error.message}`)
      totalFailed++
      continue
    }

    // Skip .keep placeholder, keep everything else
    const photos = (files || []).filter(f => !f.name.startsWith('.'))

    if (photos.length === 0) {
      console.log(`  ⏭  ${listingId} — no photos`)
      totalSkipped++
      continue
    }

    // Clear existing entries for this listing
    await supabase
      .from('listing_photos')
      .delete()
      .eq('listing_id', listingId)

    // Insert one row per photo
    const rows = photos.map((file, index) => ({
      listing_id: listingId,
      url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${listingId}/${file.name}`,
      order_index: index,
    }))

    const { error: insertError } = await supabase
      .from('listing_photos')
      .insert(rows)

    if (insertError) {
      console.log(`  ✗  ${listingId} — ${insertError.message}`)
      totalFailed++
      continue
    }

    console.log(`  ✓  ${listingId} — ${photos.length} photo${photos.length > 1 ? 's' : ''} linked`)
    photos.forEach((f, i) => console.log(`       [${i}] ${f.name}`))
    totalInserted += photos.length
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done.
  Photos linked:   ${totalInserted}
  Folders skipped: ${totalSkipped}
  Errors:          ${totalFailed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next: git add . && git commit -m "feat: link listing photos" && git push
Then verify at usethrml.com/explore
  `)
}

linkPhotos()
