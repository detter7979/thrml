#!/usr/bin/env npx tsx
/**
 * Edit a static base photo (flip/rotate + optional semantic cleanup) and re-composite T1 overlay.
 *
 * Usage:
 *   # Local base file (recommended when pinning a liked generation):
 *   npx tsx scripts/edit-static-photo.ts --base photo.png --format 1x1 \
 *     --headline "Earn while you recover." \
 *     --edit "remove the blurred dumbbells and foreground gym props"
 *
 *   npx tsx scripts/edit-static-photo.ts --base photo.png --format 9x16 \
 *     --headline "Turn your idle sauna into income." \
 *     --edit "flip 180"
 *
 *   # Existing pipeline asset (uses base_gcs_path or source_image_url):
 *   npx tsx scripts/edit-static-photo.ts --asset-id <uuid> --edit "flip horizontal, remove blurred deck railing"
 */
import fs from "node:fs"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

import { loadEnvConfig } from "@next/env"

import { HOST_PROOF_SUBTEXT } from "@/lib/agent/host-monetization-static"
import {
  editLocalBaseAndComposite,
  editStaticPhotoAsset,
} from "@/lib/agent/static-photo-recomposite"
import type { MasterAdTemplateFormat } from "@/lib/agent/static-layouts/master-ad-template"

loadEnvConfig(process.cwd())

function arg(name: string) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  return process.argv[idx + 1]?.trim()
}

async function main() {
  const assetId = arg("--asset-id")
  const basePath = arg("--base")
  const format = (arg("--format") ?? "1x1") as MasterAdTemplateFormat
  const headline = arg("--headline") ?? "Turn your idle sauna into income."
  const editPrompt = arg("--edit") ?? ""
  const outDir = arg("--out") ?? path.join(process.cwd(), ".tmp")

  if (!editPrompt) {
    throw new Error("Pass --edit with instructions (e.g. 'flip 180, remove blurred dumbbells')")
  }

  await mkdir(outDir, { recursive: true })

  if (assetId) {
    const result = await editStaticPhotoAsset({
      assetId,
      editPrompt,
      saveAsNewVariant: true,
    })
    console.log("[edit-static-photo] Pipeline asset edited")
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (!basePath || !fs.existsSync(basePath)) {
    throw new Error("Pass --base <photo.png> or --asset-id <uuid>")
  }

  const baseImage = await readFile(basePath)
  const { editedBase, composite } = await editLocalBaseAndComposite({
    baseImage,
    format,
    headline,
    subhead: HOST_PROOF_SUBTEXT,
    editPrompt,
  })

  const stem = path.basename(basePath, path.extname(basePath))
  const editedOut = path.join(outDir, `${stem}-edited-base-${format}.png`)
  const compositeOut = path.join(outDir, `${stem}-edited-composite-${format}.png`)
  await writeFile(editedOut, editedBase)
  await writeFile(compositeOut, composite)
  console.log(`[edit-static-photo] Edited base → ${editedOut}`)
  console.log(`[edit-static-photo] Composite   → ${compositeOut}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
