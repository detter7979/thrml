// Runway API wrapper for video generation.
// API docs: https://docs.dev.runwayml.com/

import { setTimeout as sleep } from "node:timers/promises"

const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1"
const RUNWAY_API_VERSION = "2024-11-06"

export interface RunwayGenerateArgs {
  prompt: string
  duration?: 5 | 10
  ratio?: "768:1280" | "1280:768" | "1024:1024"
  model?: "gen4_turbo" | "gen3a_turbo"
  promptImage?: string // optional: data URI or HTTPS URL for image-to-video
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
  const k = process.env.RUNWAY_API_KEY
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
 * Kick off a video generation task.
 * Returns immediately with the task ID; use pollTask() to await completion.
 */
export async function generateVideo(args: RunwayGenerateArgs): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    model: args.model ?? "gen4_turbo",
    promptText: args.prompt,
    duration: args.duration ?? 5,
    ratio: args.ratio ?? "768:1280",
  }
  if (args.promptImage) body.promptImage = args.promptImage
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
