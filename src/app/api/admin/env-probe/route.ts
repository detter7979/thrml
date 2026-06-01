import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

/** Temporary diagnostic — delete after debugging. Auth: x-admin-key must match ADMIN_PROBE_KEY. */
export async function GET(req: NextRequest) {
  const probeKey = process.env.ADMIN_PROBE_KEY?.trim()
  const headerKey = req.headers.get("x-admin-key")?.trim()

  if (!probeKey || !headerKey || headerKey !== probeKey) {
    return unauthorized()
  }

  const runwayKey = process.env.RUNWAY_API_KEY

  return NextResponse.json({
    hasRunway: Boolean(runwayKey),
    runwayLen: runwayKey?.length ?? 0,
    runwayFirst4: runwayKey?.slice(0, 4) ?? null,
    runwayLast4: runwayKey?.length ? runwayKey.slice(-4) : null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    runtime: process.env.NEXT_RUNTIME ?? "node",
  })
}
