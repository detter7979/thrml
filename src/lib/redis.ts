import Redis from "ioredis"

/**
 * Shared Redis client for rate limiting.
 *
 * The old per-module clients used lazyConnect + enableOfflineQueue:false, so the
 * first command on every fresh serverless instance threw "Stream isn't writeable"
 * and the limiter failed open. Here we connect explicitly and only hand out the
 * client once it is ready. Callers still fail open if Redis is unreachable.
 */

const CONNECT_TIMEOUT_MS = 2000
/** After a failed connect, skip Redis for this long so requests don't each wait on the timeout. */
const RETRY_COOLDOWN_MS = 30_000

let unavailableUntil = 0

let client: Redis | null = null
let connecting: Promise<Redis | null> | null = null

function createClient(url: string) {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
  })
  // Prevent unhandled 'error' events from crashing the function; callers handle failures.
  redis.on("error", () => {})
  return redis
}

function waitForReady(redis: Redis): Promise<Redis | null> {
  return new Promise((resolve) => {
    const done = (value: Redis | null) => {
      clearTimeout(timer)
      redis.off("ready", onReady)
      redis.off("end", onEnd)
      resolve(value)
    }
    const onReady = () => done(redis)
    const onEnd = () => done(null)
    const timer = setTimeout(() => done(null), CONNECT_TIMEOUT_MS)
    redis.once("ready", onReady)
    redis.once("end", onEnd)
    if (redis.status === "wait" || redis.status === "end") {
      redis.connect().catch(() => done(null))
    }
  })
}

/** Returns a ready Redis client, or null if Redis is not configured or not reachable right now. */
export async function getRedis(): Promise<Redis | null> {
  const url = process.env.thrml_REDIS_URL
  if (!url) return null
  if (!client) client = createClient(url)
  if (client.status === "ready") return client
  if (Date.now() < unavailableUntil) return null
  if (!connecting) {
    connecting = waitForReady(client)
      .then((ready) => {
        if (!ready) {
          unavailableUntil = Date.now() + RETRY_COOLDOWN_MS
          console.error("[redis] not reachable; rate limits fail open for 30s")
        }
        return ready
      })
      .finally(() => {
        connecting = null
      })
  }
  return connecting
}

/**
 * Fixed-window counter. Returns the hit count and seconds until the window resets,
 * or null if Redis is unavailable (callers fail open).
 */
export async function hitWindow(key: string, windowSeconds: number): Promise<{ count: number; ttl: number } | null> {
  const redis = await getRedis()
  if (!redis) return null
  const results = await redis.multi().incr(key).ttl(key).exec()
  if (!results) return null
  const [[incrErr, count], [ttlErr, ttl]] = results as [[Error | null, number], [Error | null, number]]
  if (incrErr) throw incrErr
  if (ttlErr) throw ttlErr
  // ttl -1 means the key has no expiry yet (first hit, or a previous expire was lost).
  if (ttl < 0) {
    await redis.expire(key, windowSeconds)
    return { count, ttl: windowSeconds }
  }
  return { count, ttl }
}
