import { NextRequest } from "next/server"
import Redis from "ioredis"

const redis = process.env.thrml_REDIS_URL ? new Redis(process.env.thrml_REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
}) : null

// Prevent unhandled 'error' events from crashing the serverless function.
// All errors are handled inside the try/catch in applyMemoryRateLimit.
redis?.on("error", () => {})

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

export async function applyMemoryRateLimit(params: {
  key: string
  max: number
  windowMs: number
}): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  if (!redis) return { allowed: true, remaining: params.max, retryAfterSec: 0 }

  const windowSeconds = Math.ceil(params.windowMs / 1000)

  try {
    const count = await redis.incr(params.key)
    if (count === 1) {
      await redis.expire(params.key, windowSeconds)
    }

    if (count > params.max) {
      const ttl = await redis.ttl(params.key)
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, ttl),
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, params.max - count),
      retryAfterSec: 0,
    }
  } catch (err) {
    console.error("[security] Redis rate limit error, failing open:", err)
    return { allowed: true, remaining: params.max, retryAfterSec: 0 }
  }
}

export function requestIp(request: Request | NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return request.headers.get("x-real-ip") ?? "unknown"
}
