// Runway API wrapper for video generation.
// API docs: https://docs.dev.runwayml.com/

import { setTimeout as sleep } from "node:timers/promises"

const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1"
const RUNWAY_API_VERSION = "2024-11-06"

const RUNWAY_ENV_KEYS = ["RUNWAY_API_KEY", "RUNWAYML_API_SECRET", "RUNWAY_API_SECRET"] as const

/** Ratios accepted by Runway Gen-4 Turbo image-to-video (2024-11-06 API). */
export type RunwayRatio =
  | "1280:720"
  | "720:1280"
  | "1104:832"
  | "832:1104"
  | "960:960"
  | "1584:672"

/** Stored brief values and API values — normalized before each request. */
export type RunwayRatioInput = RunwayRatio | "768:1280" | "1280:768" | "1024:1024"

/** Default POV sauna still used as gen4_turbo first frame (image-to-video is required). */
export const DEFAULT_RUNWAY_POV_REFERENCE_IMAGE_URL = "https://usethrml.com/hero-sauna.png"

function normalizeSecret(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "")
  return trimmed || null
}

/** Resolve Runway API key from common env var names (Vercel / local). */
export function resolveRunwayApiKey(): string | null {
  for (const name of RUNWAY_ENV_KEYS) {
    const value = normalizeSecret(process.env[name])
    if (value) return value
  }
  return null
}

export function resolveRunwayEnvKeyName(): (typeof RUNWAY_ENV_KEYS)[number] | null {
  for (const name of RUNWAY_ENV_KEYS) {
    if (normalizeSecret(process.env[name])) return name
  }
  return null
}

export function isRunwayConfigured(): boolean {
  return resolveRunwayApiKey() !== null
}

export function normalizeRunwayRatio(ratio?: RunwayRatioInput): RunwayRatio {
  switch (ratio) {
    case "1280:768":
    case "1280:720":
      return "1280:720"
    case "768:1280":
    case "720:1280":
      return "720:1280"
    case "1024:1024":
    case "960:960":
      return "960:960"
    case "1104:832":
    case "832:1104":
    case "1584:672":
      return ratio
    default:
      return "720:1280"
  }
}

/** HTTPS URL Runway can fetch as the image-to-video first frame. */
export function resolveRunwayPromptImage(explicit?: string | null): string {
  const direct = explicit?.trim()
  if (direct) return direct

  const fromEnv = normalizeSecret(process.env.RUNWAY_POV_REFERENCE_IMAGE_URL)
  if (fromEnv) return fromEnv

  const appUrl = normalizeSecret(process.env.NEXT_PUBLIC_APP_URL)
  if (appUrl) return `${appUrl.replace(/\/$/, "")}/hero-sauna.png`

  return DEFAULT_RUNWAY_POV_REFERENCE_IMAGE_URL
}

export interface RunwayGenerateArgs {
  prompt: string
  duration?: 5 | 10
  ratio?: RunwayRatioInput
  model?: "gen4_turbo" | "gen3a_turbo"
  /** HTTPS URL, Runway URI, or data URI — defaults to POV sauna hero still. */
  promptImage?: string
  seed?: number
}

export interface RunwayTask {
  id: string
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"
  output?: string[] // array of HTTPS URLs (typically just one for video)
  failure?: string
  failureCode?: string
  createdAt: string
  progress?: number // 0..1
}

function apiKey(): string {
  const k = resolveRunwayApiKey()
  if (!k) throw new Error("RUNWAY_API_KEY not set")
  return k
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${RUNWAY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "X-Runway-Version": RUNWAY_API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Runway API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

/**
 * Kick off a video generation task (Gen-4 Turbo image-to-video).
 * Returns immediately with the task ID; use pollTask() to await completion.
 */
export async function generateVideo(args: RunwayGenerateArgs): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    model: args.model ?? "gen4_turbo",
    promptText: args.prompt,
    promptImage: resolveRunwayPromptImage(args.promptImage),
    duration: args.duration ?? 5,
    ratio: normalizeRunwayRatio(args.ratio),
  }
  if (args.seed != null) body.seed = args.seed

  const result = await request<{ id: string }>("/image_to_video", {
    method: "POST",
    body: JSON.stringify(body),
  })
  return { taskId: result.id }
}

/**
 * Get the current state of a task. Single API call, no polling.
 */
export async function getTask(taskId: string): Promise<RunwayTask> {
  return request<RunwayTask>(`/tasks/${taskId}`)
}

/**
 * Poll a task until it completes or fails. Returns the final task state.
 * Default: poll every 5s, timeout after 5 minutes.
 */
export async function pollTask(
  taskId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<RunwayTask> {
  const interval = opts.intervalMs ?? 5_000
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000
  const start = Date.now()

  while (true) {
    const task = await getTask(taskId)
    if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELLED") {
      return task
    }
    if (Date.now() - start > timeout) {
      throw new Error(
        `Runway task ${taskId} timed out after ${timeout}ms (last status: ${task.status})`
      )
    }
    await sleep(interval)
  }
}

/**
 * Cancel a running task. Useful for cleanup on errors mid-flight.
 */
export async function cancelTask(taskId: string): Promise<void> {
  await request(`/tasks/${taskId}`, { method: "DELETE" })
}
