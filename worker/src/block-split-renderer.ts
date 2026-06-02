import ffmpeg from "fluent-ffmpeg"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseBlockSplitVideoOverlay,
  wrapOverlayLine,
  type BlockSplitVideoOverlay,
} from "./block-split-overlay.js"
import { BRAND_RUST_FFMPEG } from "./brand-colors.js"
import type { VideoTemplate } from "./template.js"

export interface BlockSplitRenderArgs {
  baseVideoPath: string
  outputPath: string
  copyText: string
  template: VideoTemplate
  workDir?: string
}

const WORKER_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..")

function resolveWorkerPath(rel: string): string {
  return join(WORKER_ROOT, rel)
}

function escapeDrawtextPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")
}

function drawtextFileStep(args: {
  inputLabel: string
  outputLabel: string
  fontPath: string
  textFile: string
  fontSize: number
  x: number
  y: number
  opacity?: number
}): string {
  const fontPath = escapeDrawtextPath(args.fontPath)
  const textFile = escapeDrawtextPath(args.textFile)
  const alpha = args.opacity != null && args.opacity < 1 ? `@${args.opacity}` : ""
  return (
    `${args.inputLabel}drawtext=fontfile='${fontPath}':textfile='${textFile}'` +
    `:fontsize=${args.fontSize}:fontcolor=0xFFFFFF${alpha}:x=${args.x}:y=${args.y}${args.outputLabel}`
  )
}

export function buildBlockSplitFilterComplex(args: {
  template: VideoTemplate
  overlay: BlockSplitVideoOverlay
  textFiles: {
    brand: string
    eyebrow: string
    headlineLines: string[]
    subhead: string
  }
}): { filter: string; outputLabel: string } {
  const layout = args.template.blockSplit
  if (!layout) throw new Error("Template is missing blockSplit layout")

  const fontPath = resolveWorkerPath(args.template.fontPath)
  const rust = BRAND_RUST_FFMPEG
  const parts: string[] = [
    `[0:v]scale=${layout.width}:${layout.videoHeight}:force_original_aspect_ratio=increase,crop=${layout.width}:${layout.videoHeight},setsar=1,format=rgb24[vid]`,
    `[vid]pad=${layout.width}:${layout.height}:0:${layout.topBlockHeight}:color=${rust},format=rgb24[base]`,
  ]

  const drawSteps: Array<{
    textFile: string
    fontSize: number
    x: number
    y: number
    opacity?: number
  }> = [
    {
      textFile: args.textFiles.brand,
      fontSize: layout.brandFontSize,
      x: layout.paddingX,
      y: layout.brandY,
      opacity: 0.85,
    },
    {
      textFile: args.textFiles.eyebrow,
      fontSize: layout.eyebrowFontSize,
      x: layout.paddingX,
      y: layout.eyebrowY,
      opacity: 0.75,
    },
  ]

  const headlineLineHeight = Math.round(layout.headlineFontSize * 1.12)
  args.textFiles.headlineLines.forEach((file, index) => {
    drawSteps.push({
      textFile: file,
      fontSize: layout.headlineFontSize,
      x: layout.paddingX,
      y: layout.headlineY + index * headlineLineHeight,
      opacity: 0.92,
    })
  })

  drawSteps.push({
    textFile: args.textFiles.subhead,
    fontSize: layout.subheadFontSize,
    x: layout.paddingX,
    y: layout.subheadY,
    opacity: 0.78,
  })

  let current = "[base]"
  drawSteps.forEach((step, index) => {
    const outputLabel = index === drawSteps.length - 1 ? "[out_rgb]" : `[txt${index}]`
    parts.push(
      drawtextFileStep({
        inputLabel: current,
        outputLabel,
        fontPath,
        textFile: step.textFile,
        fontSize: step.fontSize,
        x: step.x,
        y: step.y,
        opacity: step.opacity,
      }),
    )
    current = outputLabel
  })

  parts.push("[out_rgb]colorspace=all=bt709:iall=bt709:fast=0:format=yuv420p[out]")

  return { filter: parts.join(";"), outputLabel: "out" }
}

export async function renderBlockSplit(args: BlockSplitRenderArgs): Promise<void> {
  const overlay = parseBlockSplitVideoOverlay(args.copyText)
  const layout = args.template.blockSplit
  if (!layout) throw new Error("Template is missing blockSplit layout")

  await mkdir(dirname(args.outputPath), { recursive: true })
  const workDir = args.workDir ?? dirname(args.outputPath)
  await mkdir(workDir, { recursive: true })

  const headlineLines = wrapOverlayLine(overlay.headline, layout.headlineMaxChars, layout.headlineMaxLines)
  const textFiles = {
    brand: join(workDir, "block-brand.txt"),
    eyebrow: join(workDir, "block-eyebrow.txt"),
    headlineLines: headlineLines.map((_, index) => join(workDir, `block-headline-${index}.txt`)),
    subhead: join(workDir, "block-subhead.txt"),
  }

  await writeFile(textFiles.brand, "thrml", "utf8")
  await writeFile(textFiles.eyebrow, overlay.taglineEyebrow, "utf8")
  await Promise.all(headlineLines.map((line, index) => writeFile(textFiles.headlineLines[index]!, line, "utf8")))
  await writeFile(textFiles.subhead, overlay.subhead, "utf8")

  const { filter, outputLabel } = buildBlockSplitFilterComplex({
    template: args.template,
    overlay,
    textFiles: { ...textFiles, headlineLines: textFiles.headlineLines },
  })

  return new Promise<void>((resolvePromise, reject) => {
    ffmpeg()
      .input(args.baseVideoPath)
      .complexFilter(filter, [outputLabel])
      .videoCodec("libx264")
      .outputOptions([
        "-crf",
        "18",
        "-preset",
        "veryfast",
        "-threads",
        "2",
        "-filter_complex_threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-movflags",
        "+faststart",
        "-an",
      ])
      .output(args.outputPath)
      .on("end", () => resolvePromise())
      .on("error", (err) => reject(err))
      .run()
  })
}
