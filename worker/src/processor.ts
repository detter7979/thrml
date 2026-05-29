import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Config } from "./config.js"
import type { GcsClient } from "./gcs.js"
import { logger } from "./logger.js"
import { render } from "./renderer.js"
import { angleSlugFromConcept, unifiedVideoRenderPath } from "./paths.js"
import { getTemplate } from "./template.js"
import {
  type RenderJob,
  insertCreativeAsset,
  markCompleted,
} from "./supabase.js"

export interface ProcessorDeps {
  config: Config
  gcs: GcsClient
  supabase: SupabaseClient
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

export async function processJob(job: RenderJob, deps: ProcessorDeps): Promise<void> {
  const start = Date.now()
  const log = logger.child({ jobId: job.id, variantSlug: job.variant_slug })

  log.info("Processing job")

  const now = new Date()
  const angleSlug = angleSlugFromConcept(job.concept_slug)
  const renderedGcsPath = unifiedVideoRenderPath({
    date: now,
    category: "Hosts",
    angleSlug,
    variantSlug: job.variant_slug,
    templateVersion: job.template_version,
  })

  const workDir = await mkdtemp(join(tmpdir(), `render-${job.id.slice(0, 8)}-`))
  const baseLocal = join(workDir, "base.mp4")
  const outLocal = join(workDir, "out.mp4")

  try {
    await withTimeout(
      (async () => {
        log.info({ path: job.base_video_gcs_path }, "Downloading base video")
        await deps.gcs.download(job.base_video_gcs_path, baseLocal)

        const template = getTemplate(job.template_version)
        log.info({ templateVersion: template.version }, "Rendering")
        await render({
          baseVideoPath: baseLocal,
          outputPath: outLocal,
          copyText: job.copy_text,
          template,
        })

        if (!deps.config.LOCAL_DEV_MODE) {
          log.info({ dest: renderedGcsPath }, "Uploading render to GCS")
          await deps.gcs.upload(outLocal, renderedGcsPath)
        } else {
          const outDir = deps.config.LOCAL_DEV_OUTPUT_DIR
          await mkdir(outDir, { recursive: true })
          const localDest = join(outDir, `${job.variant_slug}_v${job.template_version}.mp4`)
          await copyFile(outLocal, localDest)
          log.info({ localDest }, "LOCAL_DEV_MODE: skipping GCS upload")
        }

        const assetId = await insertCreativeAsset(deps.supabase, deps.config, {
          briefId: job.brief_id,
          renderedGcsPath,
          variantSlug: job.variant_slug,
          conventionName: job.ad_name ?? null,
        })

        const durationMs = Date.now() - start
        await markCompleted(deps.supabase, job.id, {
          renderedGcsPath,
          renderedAssetId: assetId,
          durationMs,
        })

        log.info({ durationMs, assetId }, "Job completed")
      })(),
      deps.config.JOB_TIMEOUT_MS,
      `Job ${job.id}`
    )
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
