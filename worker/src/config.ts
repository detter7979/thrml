import { z } from "zod"

const ConfigSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GCS_PROJECT_ID: z.string().min(1),
  GCS_CREATIVE_BUCKET: z.string().min(1).default("thrml-creative"),
  GCS_SERVICE_ACCOUNT_KEY: z.string().min(1),

  WORKER_ID: z.string().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(5 * 60_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  LOCAL_DEV_MODE: z.coerce.boolean().default(false),
  LOCAL_DEV_OUTPUT_DIR: z.string().default("./local-renders"),
})

export type Config = z.infer<typeof ConfigSchema> & { WORKER_ID: string }

export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.format())
    process.exit(1)
  }
  return {
    ...parsed.data,
    WORKER_ID:
      parsed.data.WORKER_ID ?? `worker-${Math.random().toString(36).slice(2, 10)}`,
  }
}
