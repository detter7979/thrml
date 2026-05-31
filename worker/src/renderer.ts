import ffmpeg from "fluent-ffmpeg"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { VideoTemplate } from "./template.js"

export interface RenderArgs {
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

function formatDrawtextColor(hex: string, opacity?: number): string {
  const rgb = hex.replace(/^0x/i, "")
  if (opacity == null || opacity >= 1) return `0x${rgb}`
  return `0x${rgb}@${opacity}`
}

function drawtextChain(args: {
  inputLabel: string
  outputLabel: string
  fontPath: string
  textFile: string
  fontSizeExpr: string
  textColor: string
  textOpacity?: number
  yExpr: string
  lineSpacing?: string
}): string {
  const lineSpacing =
    args.lineSpacing != null ? `:line_spacing=${args.lineSpacing}` : ""
  const fontColor = formatDrawtextColor(args.textColor, args.textOpacity)
  return (
    `${args.inputLabel}drawtext=fontfile='${args.fontPath}':textfile='${args.textFile}'` +
    `:${args.fontSizeExpr}:fontcolor=${fontColor}:x=(w-text_w)/2:${args.yExpr}${lineSpacing}${args.outputLabel}`
  )
}

export function buildFilterComplex(args: {
  template: VideoTemplate
  copyTextFile: string
  copyLineFiles?: string[]
}): { filter: string; outputLabel: string; inputs: number } {
  const t = args.template
  const fontPath = escapeDrawtextPath(resolveWorkerPath(t.fontPath))
  const copyFile = escapeDrawtextPath(args.copyTextFile)
  const showGradient = t.showGradient !== false && t.gradientHeight > 0
  const showLogo = t.showLogo !== false && t.logoWidth > 0

  const fontSizeExpr = t.fontSizeRatio ? `fontsize=h*${t.fontSizeRatio}` : `fontsize=${t.textSize}`
  const lineSpacing = t.textLineSpacing ?? 11

  const parts: string[] = []
  let current = "[0:v]"

  if (showGradient) {
    const gradAlpha = Math.round(t.gradientMaxOpacity * 255)
    parts.push(
      `color=black:s=${t.width}x${t.gradientHeight}:d=10[gradbase]`,
      `[gradbase]format=rgba,geq=r='0':g='0':b='0':a='${gradAlpha}*(Y/${t.gradientHeight})'[grad]`,
      `${current}[grad]overlay=0:H-h:format=auto[bg]`,
    )
    current = "[bg]"
  }

  const lineFiles =
    t.textTopRatio != null && args.copyLineFiles?.length
      ? args.copyLineFiles.map(escapeDrawtextPath)
      : null

  if (lineFiles && lineFiles.length > 0) {
    const centerRatio = t.textTopRatio!
    const fontRatio = t.fontSizeRatio ?? 0.0295
    const lineHeightRatio = t.textLineHeightRatio ?? 1.2
    const leadHalf = `(h*${fontRatio})*(${lineHeightRatio}-1)/2`
    const lineStep = `(h*${fontRatio})*${lineHeightRatio}`
    lineFiles.forEach((lineFile, index) => {
      const yExpr =
        index === 0
          ? `y=(h*${centerRatio})-text_h-${leadHalf}`
          : `y=(h*${centerRatio})-text_h-${leadHalf}+${lineStep}`
      const outLabel = index === lineFiles.length - 1 ? "[txt]" : `[txt${index}]`
      parts.push(
        drawtextChain({
          inputLabel: current,
          outputLabel: outLabel,
          fontPath,
          textFile: lineFile,
          fontSizeExpr,
          textColor: t.textColor,
          textOpacity: t.textOpacity,
          yExpr,
        }),
      )
      current = outLabel
    })
  } else {
    const yExpr = t.textTopRatio != null ? `y=(h*${t.textTopRatio})-(text_h/2)` : `y=${t.textTopOffset}`
    parts.push(
      drawtextChain({
        inputLabel: current,
        outputLabel: "[txt]",
        fontPath,
        textFile: copyFile,
        fontSizeExpr,
        textColor: t.textColor,
        textOpacity: t.textOpacity,
        yExpr,
        lineSpacing: t.textLineSpacing != null ? String(t.textLineSpacing) : undefined,
      }),
    )
    current = "[txt]"
  }

  if (showLogo) {
    const logoPath = escapeDrawtextPath(resolveWorkerPath(t.logoPath))
    parts.push(
      `[1:v]scale=${t.logoWidth}:-1,format=rgba,colorchannelmixer=aa=${t.logoOpacity}[logo]`,
      `${current}[logo]overlay=(W-w)/2:H-h-${t.logoBottomMargin}[out]`,
    )
    return { filter: parts.join(";"), outputLabel: "out", inputs: 2 }
  }

  parts.push(`${current}null[out]`)
  return { filter: parts.join(";"), outputLabel: "out", inputs: 1 }
}

export async function render(args: RenderArgs): Promise<void> {
  const { baseVideoPath, outputPath, copyText, template: t } = args

  await mkdir(dirname(outputPath), { recursive: true })

  const workDir = args.workDir ?? dirname(outputPath)
  await mkdir(workDir, { recursive: true })
  const copyTextFile = join(workDir, "overlay-copy.txt")
  await writeFile(copyTextFile, copyText, "utf8")

  const copyLines = copyText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const copyLineFiles: string[] = []
  if (t.textTopRatio != null && copyLines.length > 1) {
    for (let i = 0; i < copyLines.length; i++) {
      const lineFile = join(workDir, `overlay-line-${i}.txt`)
      await writeFile(lineFile, copyLines[i]!, "utf8")
      copyLineFiles.push(lineFile)
    }
  }

  const { filter, outputLabel, inputs } = buildFilterComplex({
    template: t,
    copyTextFile,
    copyLineFiles: copyLineFiles.length > 0 ? copyLineFiles : undefined,
  })

  return new Promise<void>((resolvePromise, reject) => {
    const cmd = ffmpeg().input(baseVideoPath)
    if (inputs > 1) cmd.input(resolveWorkerPath(t.logoPath))

    cmd
      .complexFilter(filter, [outputLabel])
      .videoCodec("libx264")
      .outputOptions([
        "-crf",
        "18",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
      ])
      .output(outputPath)
      .on("end", () => resolvePromise())
      .on("error", (err) => reject(err))
      .run()
  })
}
