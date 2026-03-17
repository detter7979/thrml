import { NextRequest, NextResponse } from "next/server"
import Redis from "ioredis"

const redis = process.env.thrml_REDIS_URL ? new Redis(process.env.thrml_REDIS_URL) : null

interface RateLimitOptions {
  maxRequests: number
  windowMs: number
  identifier?: string
}

export async function rateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const { maxRequests, windowMs, identifier } = options

  if (!redis) return null

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"

  const key = `rl:${identifier ? `${identifier}:` : ""}${ip}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  try {
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, windowSeconds)
    }

    if (count > maxRequests) {
      const ttl = await redis.ttl(key)
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, ttl)),
            "X-RateLimit-Limit": String(maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        }
      )
    }

    return null
  } catch (err) {
    console.error("[rate-limit] KV error, failing open:", err)
    return null
  }
}
