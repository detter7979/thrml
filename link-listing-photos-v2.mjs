// ============================================================
// link-listing-photos.mjs
// Run from your project root:
// node --env-file=.env.local link-listing-photos.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'listing-photos'

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
    const { data: files, error: filesError } = await supabase.storage
      .from(BUCKET)
      .list(listingId, {
        limit: 50,
        sortBy: { column: 'name', order: 'asc' },
      })

    if (filesError) {
      console.log(`  ✗  ${listingId} — ${filesError.message}`)
      totalFailed++
      continue
    }

    const photos = (files || []).filter(
      f => f.name !== '.keep' && f.name !== ''
    )

    if (photos.length === 0) {
      console.log(`  ⏭  ${listingId} — no photos`)
      totalSkipped++
      continue
    }

    await supabase
      .from('listing_photos')
      .delete()
      .eq('listing_id', listingId)

    const rows = photos.map((file, index) => ({
      listing_id: listingId,
      url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${listingId}/${file.name}`,
      order_index: index,
    }))

    const { error: insertError } = await supabase
      .from('listing_photos')
      .insert(rows)

    if (insertError) {
      console.log(`  ✗  ${listingId} — insert failed: ${insertError.message}`)
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

Verify in Supabase SQL Editor:
  SELECT l.title, COUNT(p.id) as photos
  FROM listings l
  LEFT JOIN listing_photos p ON p.listing_id = l.id
  GROUP BY l.title
  ORDER BY photos DESC;
  `)
}

linkPhotos()
