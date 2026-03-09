// ============================================================
// create-listing-folders.mjs
// Run from your project root: node create-listing-folders.mjs
// Creates a placeholder .keep file in each listing folder
// so the folders appear in Supabase Storage
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'listing-images'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── All listing IDs ─────────────────────────────────────────
const LISTING_IDS = [
  // New LA mock listings
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8001', // The Cedar Box
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8002', // Three Generations
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8003', // Slow Heat
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8004', // No Signal
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8005', // Two Blocks from the Beach
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8006', // 39 Degrees
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8007', // The Contrast Room
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8008', // The Light Room
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8009', // Pre-Surf Infrared
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8010', // The Quiet Pod
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8011', // The City Reset
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8012', // Canyon Cold
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8013', // The Frequency Room
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8014', // The Salt Room
  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8015', // The Pressure Chamber

  // Real Seattle listings
  '28d58831-ab82-46ab-a189-3cfe1eb2426c', // Bainbridge Cold Plunge
  'e0f7a21d-539b-406c-8fec-82891001336c', // Vibrational PEMF Frequencies
  'ea6c817e-ef1a-4f11-8d60-5c247eca321d', // Red Light Therapy (draft)
]

async function createFolders() {
  console.log(`\nCreating folders in bucket: ${BUCKET}\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const id of LISTING_IDS) {
    const path = `${id}/.keep`

    // Upload a tiny placeholder file to create the folder
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([''], { type: 'text/plain' }), {
        upsert: false, // don't overwrite if already exists
      })

    if (error) {
      if (error.message?.includes('already exists')) {
        console.log(`  ⏭  Skipped (exists): ${id}`)
        skipped++
      } else {
        console.log(`  ✗  Failed: ${id} — ${error.message}`)
        failed++
      }
    } else {
      console.log(`  ✓  Created: ${id}`)
      created++
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done.
  Created:  ${created}
  Skipped:  ${skipped}
  Failed:   ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
  1. Go to Supabase → Storage → listing-images
  2. Open any listing folder
  3. Upload photos — drag and drop works
  4. Copy the public URL after uploading
  5. Run the SQL to link photos to the listing
  `)
}

createFolders()
