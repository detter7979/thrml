#!/usr/bin/env npx tsx
/** Composite Master Ad Template overlay onto a local photo (validates fonts + layout). */
import fs from "node:fs"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"

import { HOST_PROOF_SUBTEXT } from "@/lib/agent/host-monetization-static"
import {
  renderMasterAdTemplate,
  type MasterAdTemplateFormat,
} from "@/lib/agent/static-layouts/master-ad-template"

async function main() {
  const photoPath = process.argv[2]?.trim()
  const format = (process.argv[3]?.trim() ?? "1x1") as MasterAdTemplateFormat
  const headline = process.argv[4]?.trim() ?? "Turn your idle sauna into income."

  if (!photoPath || !fs.existsSync(photoPath)) {
    throw new Error("Usage: preview-master-ad-template.ts <photo> [1x1|4x5|9x16] [headline]")
  }

  const baseImage = await readFile(photoPath)
  const png = await renderMasterAdTemplate({
    baseImage,
    format,
    headline,
    subhead: HOST_PROOF_SUBTEXT,
  })

  const out = path.join(process.cwd(), ".tmp", `master-ad-preview-${format}.png`)
  await writeFile(out, png)
  console.log(`[preview] ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
