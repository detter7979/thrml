import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import { checkPwnedPassword } from "@/lib/security/pwned-password"
import { validateSetPassword } from "@/lib/security/set-password"
import { verifyTurnstile } from "@/lib/security/verify-turnstile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Admin: server-side security smoke checks (no side effects). Runs the same password validator
 * signup / reset use, and the captcha verifier, from production.
 */
export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error
  const strongRandom = `thrml-${randomUUID()}`
  const [short, breached, random, rawBreached, captchaEmpty, captchaForged] = await Promise.all([
    validateSetPassword("password"),
    validateSetPassword("password123456"),
    validateSetPassword(strongRandom),
    checkPwnedPassword("password123456"),
    verifyTurnstile("").catch((e) => `error: ${e instanceof Error ? e.message : e}`),
    verifyTurnstile("forged-token-123").catch((e) => `error: ${e instanceof Error ? e.message : e}`),
  ])
  return NextResponse.json({
    password: {
      "'password' (8 chars) rejected": !short.ok,
      "'password123456' (breached) rejected": !breached.ok,
      "random strong password accepted": random.ok,
      hibpReachable: !rawBreached.errored,
      messages: { short: short.ok ? null : short.error, breached: breached.ok ? null : breached.error },
    },
    captcha: { emptyTokenBlocked: captchaEmpty === false, forgedTokenBlocked: captchaForged === false },
  })
}
