import "server-only"

import { createPrivateKey, sign } from "node:crypto"
import { connect, type ClientHttp2Session } from "node:http2"

/**
 * Minimal APNs sender (token-based auth, HTTP/2). Configure on Vercel:
 *   APNS_KEY_ID      — Key ID of the .p8 key (Apple Developer → Keys)
 *   APNS_TEAM_ID     — Apple Developer Team ID
 *   APNS_AUTH_KEY    — contents of the .p8 file (PEM; "\n" escapes are fine)
 *   APNS_BUNDLE_ID   — the iOS app's bundle ID (default com.usethrml.app)
 *   APNS_PRODUCTION  — "true" for App Store / TestFlight builds, anything else uses the sandbox
 */

export type ApnsMessage = {
  title: string
  body: string
  /** Path or absolute usethrml.com URL the app opens when the notification is tapped. */
  url?: string
  /** Groups notifications in Notification Center (e.g. a conversation id). */
  threadId?: string
  badge?: number
}

export type ApnsResult = { token: string; ok: boolean; status: number; reason?: string }

function config() {
  const keyId = process.env.APNS_KEY_ID?.trim()
  const teamId = process.env.APNS_TEAM_ID?.trim()
  const key = process.env.APNS_AUTH_KEY?.replace(/\\n/g, "\n").trim()
  if (!keyId || !teamId || !key) return null
  return {
    keyId,
    teamId,
    key,
    bundleId: process.env.APNS_BUNDLE_ID?.trim() || "com.usethrml.app",
    host: process.env.APNS_PRODUCTION === "true" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com",
  }
}

export function apnsConfigured() {
  return config() !== null
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url")

// Apple accepts a provider token for up to an hour; refresh well before that.
let cachedJwt: { value: string; issuedAt: number } | null = null
function providerToken(cfg: NonNullable<ReturnType<typeof config>>) {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.value
  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }))
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: now }))
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(cfg.key),
    dsaEncoding: "ieee-p1363",
  })
  cachedJwt = { value: `${header}.${claims}.${base64url(signature)}`, issuedAt: now }
  return cachedJwt.value
}

function sendOne(
  session: ClientHttp2Session,
  cfg: NonNullable<ReturnType<typeof config>>,
  token: string,
  message: ApnsMessage
): Promise<ApnsResult> {
  const payload = JSON.stringify({
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
      ...(message.threadId ? { "thread-id": message.threadId } : {}),
      ...(typeof message.badge === "number" ? { badge: message.badge } : {}),
    },
    ...(message.url ? { url: message.url } : {}),
  })

  return new Promise((resolve) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${providerToken(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    })
    let status = 0
    let body = ""
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0)
    })
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      let reason: string | undefined
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined
      } catch {
        reason = body || undefined
      }
      resolve({ token, ok: status === 200, status, reason })
    })
    request.on("error", (error) => resolve({ token, ok: false, status: 0, reason: error.message }))
    request.end(payload)
  })
}

/** Sends one alert to several device tokens over a single connection. */
export async function sendApns(tokens: string[], message: ApnsMessage): Promise<ApnsResult[]> {
  const cfg = config()
  if (!cfg || tokens.length === 0) return []
  const session = connect(cfg.host)
  try {
    return await Promise.all(tokens.map((token) => sendOne(session, cfg, token, message)))
  } finally {
    session.close()
  }
}

/** Tokens Apple says will never work again; we stop sending to them. */
export function isDeadToken(result: ApnsResult) {
  return result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered"
}
