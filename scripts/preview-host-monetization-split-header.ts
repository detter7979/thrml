#!/usr/bin/env npx tsx
import fs from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  SPLIT_HEADER_DEFAULTS,
  prepareSplitHeaderTokens,
  renderPreparedSvg,
  renderSvgToPng,
} from "@/lib/agent/svg-template-generator"

async function main() {
  const heroPhoto = await readFile(path.join(process.cwd(), "public", "hero-sauna.png"))
  const heroMime = heroPhoto[0] === 0xff && heroPhoto[1] === 0xd8 ? "image/jpeg" : "image/png"
  const tokens = prepareSplitHeaderTokens("1x1", {
    TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
    HEADLINE: SPLIT_HEADER_DEFAULTS.HEADLINE,
    SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
    PHOTO_URL: `data:${heroMime};base64,${heroPhoto.toString("base64")}`,
  })

  const rawSvg = fs.readFileSync("config/creative-templates/svg/thrml_split_header_static_1x1.svg", "utf8")
  const svg = renderPreparedSvg(rawSvg, tokens)
  const png = await renderSvgToPng(svg)

  fs.mkdirSync(".tmp", { recursive: true })
  const outPath = ".tmp/host-monetization-split-header-1x1.png"
  fs.writeFileSync(outPath, png)

  console.log(`[preview] Wrote ${outPath} (${png.length} bytes)`)
  console.log("[preview] Tokens:", tokens)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
