import { loadConfig } from "./config.js"
import { GcsClient } from "./gcs.js"
import { logger } from "./logger.js"
import { processJob } from "./processor.js"
import { claimNextJob, makeSupabaseClient, markFailed } from "./supabase.js"

const config = loadConfig()
const gcs = new GcsClient(config)
const supabase = makeSupabaseClient(config)

let shutdownRequested = false
process.on("SIGTERM", () => {
  shutdownRequested = true
  logger.info("SIGTERM received")
})
process.on("SIGINT", () => {
  shutdownRequested = true
  logger.info("SIGINT received")
})

async function tick(): Promise<void> {
  const job = await claimNextJob(supabase, config.WORKER_ID)
  if (!job) return

  try {
    await processJob(job, { config, gcs, supabase })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined
    const willRetry = job.attempts < job.max_attempts
    logger.error({ jobId: job.id, err: errorMessage, willRetry }, "Job failed")
    await markFailed(supabase, job.id, { errorMessage, errorStack, willRetry })
  }
}

async function main(): Promise<void> {
  logger.info(
    { workerId: config.WORKER_ID, pollIntervalMs: config.POLL_INTERVAL_MS },
    "Worker started"
  )

  while (!shutdownRequested) {
    try {
      await tick()
    } catch (err) {
      logger.error({ err }, "Tick failed (will continue)")
    }
    if (!shutdownRequested) {
      await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS))
    }
  }

  logger.info("Worker shut down cleanly")
}

main().catch((err) => {
  logger.fatal({ err }, "Worker crashed")
  process.exit(1)
})
