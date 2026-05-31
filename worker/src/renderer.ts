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

export function buildFilterComplex(args: {
  template: VideoTemplate
  copyTextFile: string
}): { filter: string; outputLabel: string; inputs: number } {
  const t = args.template
  const fontPath = escapeDrawtextPath(resolveWorkerPath(t.fontPath))
  const copyFile = escapeDrawtextPath(args.copyTextFile)
  const showGradient = t.showGradient !== false && t.gradientHeight > 0
  const showLogo = t.showLogo !== false && t.logoWidth > 0

  const fontSizeExpr = t.fontSizeRatio ? `fontsize=h*${t.fontSizeRatio}` : `fontsize=${t.textSize}`
  const yExpr = t.textTopRatio != null ? `y=(h*${t.textTopRatio})-(text_h/2)` : `y=${t.textTopOffset}`
  const lineSpacing =
    t.textLineSpacing != null ? `:line_spacing=${t.textLineSpacing}` : ""
  const textAlign =
    t.textTopRatio != null ? ":text_align=C:fix_bounds=1" : ""

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

  parts.push(
    `${current}drawtext=fontfile='${fontPath}':textfile='${copyFile}':${fontSizeExpr}:fontcolor=0x${t.textColor}:x=(w-text_w)/2:${yExpr}${lineSpacing}${textAlign}[txt]`,
  )
  current = "[txt]"

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

  const { filter, outputLabel, inputs } = buildFilterComplex({ template: t, copyTextFile })

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
