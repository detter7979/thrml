import { NextRequest, NextResponse } from "next/server"

import { hitWindow } from "@/lib/redis"

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

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"

  const key = `rl:${identifier ? `${identifier}:` : ""}${ip}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  try {
    const hit = await hitWindow(key, windowSeconds)
    if (!hit) return null
    const { count, ttl } = hit

    if (count > maxRequests) {
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
