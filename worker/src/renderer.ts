import ffmpeg from "fluent-ffmpeg"
import { mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { VideoTemplate } from "./template.js"

export interface RenderArgs {
  baseVideoPath: string
  outputPath: string
  copyText: string
  template: VideoTemplate
}

const WORKER_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..")

function resolveWorkerPath(rel: string): string {
  return join(WORKER_ROOT, rel)
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
}

export async function render(args: RenderArgs): Promise<void> {
  const { baseVideoPath, outputPath, copyText, template: t } = args

  await mkdir(dirname(outputPath), { recursive: true })

  const fontPath = resolveWorkerPath(t.fontPath)
  const logoPath = resolveWorkerPath(t.logoPath)
  const escapedCopy = escapeDrawtext(copyText)
  const gradAlpha = Math.round(t.gradientMaxOpacity * 255)

  const filterComplex = [
    `color=black:s=${t.width}x${t.gradientHeight}:d=10[gradbase]`,
    `[gradbase]format=rgba,geq=r='0':g='0':b='0':a='${gradAlpha}*(Y/${t.gradientHeight})'[grad]`,
    `[0:v][grad]overlay=0:H-h:format=auto[bg]`,
    `[bg]drawtext=fontfile='${fontPath}':text='${escapedCopy}':fontsize=${t.textSize}:fontcolor=0x${t.textColor}:x=(w-text_w)/2:y=${t.textTopOffset}[txt]`,
    `[1:v]scale=${t.logoWidth}:-1,format=rgba,colorchannelmixer=aa=${t.logoOpacity}[logo]`,
    `[txt][logo]overlay=(W-w)/2:H-h-${t.logoBottomMargin}[out]`,
  ].join(";")

  return new Promise<void>((resolvePromise, reject) => {
    ffmpeg()
      .input(baseVideoPath)
      .input(logoPath)
      .complexFilter(filterComplex, ["out"])
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
