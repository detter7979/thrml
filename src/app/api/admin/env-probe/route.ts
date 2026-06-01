import { NextRequest, NextResponse } from "next/server"

import { isRunwayConfigured, resolveRunwayApiKey, resolveRunwayEnvKeyName } from "@/lib/agent/runway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RUNWAY_ENV_KEYS = ["RUNWAY_API_KEY", "RUNWAYML_API_SECRET", "RUNWAY_API_SECRET"] as const

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function secretFingerprint(value: string | undefined) {
  if (!value) return { present: false, len: 0, first4: null as string | null, last4: null as string | null }
  return {
    present: true,
    len: value.length,
    first4: value.slice(0, 4),
    last4: value.length >= 4 ? value.slice(-4) : value,
  }
}

/** Temporary diagnostic — delete after debugging. Auth: x-admin-key must match ADMIN_PROBE_KEY. */
export async function GET(req: NextRequest) {
  const probeKey = process.env.ADMIN_PROBE_KEY?.trim()
  const headerKey = req.headers.get("x-admin-key")?.trim()

  if (!probeKey || !headerKey || headerKey !== probeKey) {
    return unauthorized()
  }

  const resolved = resolveRunwayApiKey()
  const runwayKey = process.env.RUNWAY_API_KEY

  const runwayKeysInProcessEnv = Object.keys(process.env)
    .filter((name) => /runway/i.test(name))
    .sort()

  const runwayEnv = Object.fromEntries(
    RUNWAY_ENV_KEYS.map((name) => [name, secretFingerprint(process.env[name])])
  )

  return NextResponse.json({
    hasRunway: isRunwayConfigured(),
    resolvedFrom: resolveRunwayEnvKeyName(),
    runwayLen: resolved?.length ?? 0,
    runwayFirst4: resolved?.slice(0, 4) ?? null,
    runwayLast4: resolved?.length ? resolved.slice(-4) : null,
    runwayEnv,
    runwayKeysInProcessEnv,
    adminProbeConfigured: Boolean(probeKey),
    adminProbeLen: probeKey.length,
    legacyRunwayApiKeyOnly: secretFingerprint(runwayKey),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelProjectId: process.env.VERCEL_PROJECT_ID ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    runtime: process.env.NEXT_RUNTIME ?? "node",
  })
}
