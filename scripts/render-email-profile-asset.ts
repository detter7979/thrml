#!/usr/bin/env npx tsx
/**
 * Renders a 1080×1080 email profile / avatar lockup:
 * orange field, centered thrml wordmark, tagline below.
 *
 *   npx tsx scripts/render-email-profile-asset.ts
 *   → public/brand/email-profile-1080.png
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { renderBrandAdSvgToPng } from "@/lib/agent/static-layouts/brand-ad-fonts"

const SIZE = 1080
const OUT_DIR = path.join(process.cwd(), "public", "brand")
const OUT_PNG = path.join(OUT_DIR, "email-profile-1080.png")
const OUT_SVG = path.join(OUT_DIR, "email-profile-1080.svg")

/** Matches site nav + email header band */
const ORANGE = "#C75B3A"
const CREAM = "#F5EFE8"
const TAGLINE = "PRIVATE WELLNESS, BY THE HOUR"

function buildSvg() {
  const cx = SIZE / 2
  const wordmarkSize = 200
  const taglineSize = 34
  const taglineTracking = taglineSize * 0.12
  const wordmarkY = cx - 28
  const taglineY = wordmarkY + wordmarkSize * 0.52 + taglineSize + 18

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="thrml — ${TAGLINE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${ORANGE}"/>
  <text
    x="${cx}"
    y="${wordmarkY}"
    text-anchor="middle"
    fill="${CREAM}"
    font-family="DM Serif Display, Georgia, serif"
    font-size="${wordmarkSize}"
    font-weight="400"
    letter-spacing="-4"
  >thrml</text>
  <text
    x="${cx}"
    y="${taglineY}"
    text-anchor="middle"
    fill="${CREAM}"
    fill-opacity="0.9"
    font-family="thrml-sans, &quot;Helvetica Neue&quot;, Arial, sans-serif"
    font-size="${taglineSize}"
    font-weight="500"
    letter-spacing="${taglineTracking}"
  >${TAGLINE}</text>
</svg>`
}

async function main() {
  const svg = buildSvg()
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_SVG, svg, "utf8")

  const png = await renderBrandAdSvgToPng(svg)
  await writeFile(OUT_PNG, png)

  console.log(`Wrote ${OUT_SVG}`)
  console.log(`Wrote ${OUT_PNG} (${SIZE}×${SIZE})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
