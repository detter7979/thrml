import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import sharp from "sharp"

const require = createRequire(import.meta.url)
const phantomJsPath = (require("phantomjs-prebuilt") as { path: string }).path
const svgToPngPhantomScript = require.resolve("svg-to-png/lib/phantomscript.js")

export type CompositeStaticOptions = {
  baseImage: Buffer | string
  format: "1x1" | "9x16" | "4x5"
  headline: string
  subtext: string
  cta: string
  variation: "A" | "B" | "C"
}

const CANVAS = {
  "1x1": { width: 1080, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
} satisfies Record<CompositeStaticOptions["format"], { width: number; height: number }>

const CREAM = "#F7F3EE"
const RUST = "#C75B3A"
const UMBER = "#1A1410"
const SVG_RENDER_TIMEOUT_MS = 15_000

function imageBuffer(input: Buffer | string) {
  if (Buffer.isBuffer(input)) return input

  const base64 = input.includes(",") ? input.split(",").pop() : input
  if (!base64) throw new Error("baseImage must be a Buffer or base64 string")

  return Buffer.from(base64, "base64")
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function estimateTextWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.55
}

function wrapText(value: string, fontSize: number, maxWidth: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && estimateTextWidth(next, fontSize) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }

  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

function fontFaces() {
  const dmSansPath = path.resolve("node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2")
  const dmSansSemiBoldPath = path.resolve("node_modules/@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2")
  const dmSansItalicPath = path.resolve("node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-italic.woff2")
  const dmSerifPath = path.resolve(
    "node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2",
  )

  return `
    @font-face {
      font-family: "DM Serif Display";
      src: url("file://${dmSerifPath}") format("woff2");
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: "DM Sans";
      src: url("file://${dmSansPath}") format("woff2");
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: "DM Sans";
      src: url("file://${dmSansSemiBoldPath}") format("woff2");
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: "DM Sans";
      src: url("file://${dmSansItalicPath}") format("woff2");
      font-weight: 400;
      font-style: italic;
    }
  `
}

function multilineText({
  text,
  x,
  y,
  fontSize,
  lineHeight,
  maxWidth,
  family,
  fill = CREAM,
  opacity = 1,
  weight = 400,
  style = "normal",
}: {
  text: string
  x: number
  y: number
  fontSize: number
  lineHeight: number
  maxWidth: number
  family: "DM Serif Display" | "DM Sans"
  fill?: string
  opacity?: number
  weight?: 400 | 600
  style?: "normal" | "italic"
}) {
  const lines = wrapText(text, fontSize, maxWidth)

  return `
    <text x="${x}" y="${y}" fill="${fill}" fill-opacity="${opacity}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" font-style="${style}">
      ${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("")}
    </text>
  `
}

function ctaPill(text: string, x: number, y: number) {
  const fontSize = 18
  const paddingX = 32
  const paddingY = 16
  const width = Math.ceil(estimateTextWidth(text, fontSize) + paddingX * 2)
  const height = fontSize + paddingY * 2

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${RUST}" />
      <text x="${x + paddingX}" y="${y + paddingY + fontSize - 2}" fill="${CREAM}" font-family="DM Sans" font-size="${fontSize}" font-weight="600">${escapeXml(text)}</text>
    </g>
  `
}

function wordmark(width: number) {
  const x = width - 160

  return `
    <text x="${x}" y="88" fill="${CREAM}" fill-opacity="0.92" font-family="DM Serif Display" font-size="34" textLength="80" lengthAdjust="spacingAndGlyphs">thrml</text>
  `
}

function gradientOverlay(width: number, height: number) {
  const overlayTop = height / 2

  return `
    <defs>
      <linearGradient id="bottom-gradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${UMBER}" stop-opacity="0" />
        <stop offset="100%" stop-color="${UMBER}" stop-opacity="0.75" />
      </linearGradient>
    </defs>
    <rect x="0" y="${overlayTop}" width="${width}" height="${height - overlayTop}" fill="url(#bottom-gradient)" />
  `
}

function variationA({ width, height, headline, subtext, cta, format }: LayerOptions) {
  const headlineSize = format === "9x16" ? 72 : 64

  return `
    ${gradientOverlay(width, height)}
    ${multilineText({
      text: headline,
      x: 80,
      y: height - 280,
      fontSize: headlineSize,
      lineHeight: Math.round(headlineSize * 1.05),
      maxWidth: width - 160,
      family: "DM Serif Display",
    })}
    ${multilineText({
      text: subtext,
      x: 80,
      y: height - 200,
      fontSize: 28,
      lineHeight: 36,
      maxWidth: width - 160,
      family: "DM Sans",
      opacity: 0.8,
    })}
    ${ctaPill(cta, 80, height - 100)}
    ${wordmark(width)}
  `
}

function variationB({ width, height, headline, cta }: LayerOptions) {
  return `
    <rect x="56" y="${height - 190}" width="680" height="154" rx="28" fill="${UMBER}" fill-opacity="0.66" />
    ${multilineText({
      text: headline,
      x: 80,
      y: height - 140,
      fontSize: 36,
      lineHeight: 43,
      maxWidth: 600,
      family: "DM Serif Display",
    })}
    ${ctaPill(cta, 80, height - 100)}
    ${wordmark(width)}
  `
}

function variationC({ width, height, headline, subtext, cta, format }: LayerOptions) {
  const headlineSize = format === "9x16" ? 72 : 64

  return `
    ${gradientOverlay(width, height)}
    ${multilineText({
      text: `★★★★★  ${subtext}`,
      x: 80,
      y: 110,
      fontSize: 24,
      lineHeight: 32,
      maxWidth: width - 280,
      family: "DM Sans",
      style: "italic",
      opacity: 0.9,
    })}
    ${multilineText({
      text: headline,
      x: 80,
      y: Math.round(height * 0.52),
      fontSize: headlineSize,
      lineHeight: Math.round(headlineSize * 1.05),
      maxWidth: width - 160,
      family: "DM Serif Display",
    })}
    ${multilineText({
      text: subtext,
      x: 80,
      y: Math.round(height * 0.52) + 110,
      fontSize: 28,
      lineHeight: 36,
      maxWidth: width - 160,
      family: "DM Sans",
      opacity: 0.8,
    })}
    ${ctaPill(cta, 80, Math.round(height * 0.52) + 185)}
    ${wordmark(width)}
  `
}

type LayerOptions = {
  width: number
  height: number
  format: CompositeStaticOptions["format"]
  headline: string
  subtext: string
  cta: string
}

function brandSvg(opts: CompositeStaticOptions & { width: number; height: number }) {
  const layerOpts = {
    width: opts.width,
    height: opts.height,
    format: opts.format,
    headline: opts.headline,
    subtext: opts.subtext,
    cta: opts.cta,
  }

  const content =
    opts.variation === "A" ? variationA(layerOpts) : opts.variation === "B" ? variationB(layerOpts) : variationC(layerOpts)

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
      <style>${fontFaces()}</style>
      ${content}
    </svg>
  `
}

function runSvgToPng(svgPath: string, outputDir: string, width: number, height: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(phantomJsPath, [
      svgToPngPhantomScript,
      JSON.stringify([svgPath]),
      outputDir,
      `${width}px`,
      `${height}px`,
    ])
    const stderr: Buffer[] = []

    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`svg-to-png render timed out after ${SVG_RENDER_TIMEOUT_MS}ms`))
    }, SVG_RENDER_TIMEOUT_MS)

    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
        return
      }

      const message = Buffer.concat(stderr).toString("utf-8").trim()
      reject(new Error(`svg-to-png render failed with exit code ${code}${message ? `: ${message}` : ""}`))
    })
  })
}

async function renderSvgLayer(svg: string, width: number, height: number) {
  const tmpDir = path.join(os.tmpdir(), `thrml-composite-${randomUUID()}`)
  const svgPath = path.join(tmpDir, "layer.svg")
  const pngPath = path.join(tmpDir, "layer.png")

  await mkdir(tmpDir, { recursive: true })

  try {
    await writeFile(svgPath, svg)
    await runSvgToPng(svgPath, tmpDir, width, height)

    return await readFile(pngPath)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

export async function compositeStatic(opts: CompositeStaticOptions): Promise<Buffer> {
  const canvas = CANVAS[opts.format]
  const base = await sharp(imageBuffer(opts.baseImage))
    .resize(canvas.width, canvas.height, { fit: "cover", position: "center" })
    .png()
    .toBuffer()

  const layer = await renderSvgLayer(brandSvg({ ...opts, ...canvas }), canvas.width, canvas.height)

  return sharp(base)
    .composite([{ input: layer, left: 0, top: 0 }])
    .png()
    .toBuffer()
}
