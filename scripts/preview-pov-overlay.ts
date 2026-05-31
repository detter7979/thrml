#!/usr/bin/env npx tsx
/** Mock POV video overlay (template v2) on a clean photo plate. */
import fs from "node:fs"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { Resvg } from "@resvg/resvg-js"

import { brandAdFontFiles, injectBrandAdFonts } from "@/lib/agent/static-layouts/brand-ad-fonts"

const COPY = "pov: you turned your idle sauna\ninto income"
const TEXT_TOP_RATIO = 0.4
const LINE_HEIGHT_RATIO = 1.2
const FONT_SIZE_RATIO = 0.0295
const TEXT_OPACITY = 0.92

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

async function photoDataUrl(filePath: string) {
  const buffer = await readFile(filePath)
  const mime = buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : "image/png"
  return `data:${mime};base64,${buffer.toString("base64")}`
}

function buildSvg(photoDataUrl: string, width = 1080, height = 1920) {
  const fontSize = Math.round(height * FONT_SIZE_RATIO)
  const centerY = height * TEXT_TOP_RATIO
  const [line1, line2] = COPY.split("\n")
  const line1Y = centerY - fontSize * (LINE_HEIGHT_RATIO / 2)
  const line2Y = line1Y + fontSize * LINE_HEIGHT_RATIO

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${photoDataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <text x="${width / 2}" y="${line1Y}" text-anchor="middle" fill="#FFFFFF" fill-opacity="${TEXT_OPACITY}" font-family="DM Serif Display, Georgia, serif" font-size="${fontSize}" font-weight="400">${escapeXml(line1)}</text>
  <text x="${width / 2}" y="${line2Y}" text-anchor="middle" fill="#FFFFFF" fill-opacity="${TEXT_OPACITY}" font-family="DM Serif Display, Georgia, serif" font-size="${fontSize}" font-weight="400">${escapeXml(line2)}</text>
</svg>`
}

async function main() {
  const photoPath =
    process.argv[2]?.trim() ??
    path.join(process.cwd(), "public", "hero-sauna.png")
  const outPath = path.join(process.cwd(), ".tmp", "pov-overlay-preview-9x16.png")

  const svg = buildSvg(await photoDataUrl(photoPath))
  const withFonts = await injectBrandAdFonts(svg)
  const png = Buffer.from(
    new Resvg(withFonts, {
      font: {
        fontFiles: brandAdFontFiles(),
        loadSystemFonts: false,
        defaultFontFamily: "DM Serif Display",
      },
    }).render().asPng(),
  )

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, png)
  console.log(`[preview] ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
