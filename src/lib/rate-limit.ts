import { NextRequest, NextResponse } from "next/server"

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

interface RateLimitOptions {
  maxRequests: number
  windowMs: number
  identifier?: string
}

export function rateLimit(request: NextRequest, options: RateLimitOptions) {
  const { maxRequests, windowMs, identifier } = options
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"

  const key = identifier ? `${ip}:${identifier}` : ip
  const now = Date.now()

  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return null
  }

  entry.count++

  if (entry.count > maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetTime - now) / 1000)),
        },
      }
    )
  }

  return null
}
