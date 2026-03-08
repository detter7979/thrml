import { NextRequest } from "next/server"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim())
}

export function sanitizeNextPath<T extends string | null>(
  raw: string | null | undefined,
  fallback: T = "/" as T
) {
  if (!raw) return fallback
  const candidate = raw.trim()
  if (!candidate.startsWith("/")) return fallback
  if (candidate.startsWith("//")) return fallback
  if (candidate.includes("\\")) return fallback
  return candidate
}

type RateLimitState = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitState>()

export function applyMemoryRateLimit(params: {
  key: string
  max: number
  windowMs: number
}) {
  const now = Date.now()
  const existing = rateLimitStore.get(params.key)
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(params.key, { count: 1, resetAt: now + params.windowMs })
    return { allowed: true, remaining: Math.max(0, params.max - 1), retryAfterSec: 0 }
  }

  if (existing.count >= params.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  rateLimitStore.set(params.key, existing)
  return { allowed: true, remaining: Math.max(0, params.max - existing.count), retryAfterSec: 0 }
}

export function requestIp(request: Request | NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}
