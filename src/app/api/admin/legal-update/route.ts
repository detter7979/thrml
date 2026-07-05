import { NextRequest, NextResponse } from "next/server"

import { sendLegalUpdateBroadcast, type LegalUpdateKind } from "@/lib/emails/legal-updates"

export const maxDuration = 300

const VALID_KINDS: LegalUpdateKind[] = ["privacy", "terms", "consumer_health"]

function authGuard(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const supplied =
    req.headers.get("x-cron-secret") ??
    req.headers.get("cron_secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  return Boolean(secret && supplied === secret)
}

/**
 * Manually triggered broadcast for Privacy Policy / Terms of Service /
 * Consumer Health Agreement updates. Idempotent per (user, kind:version) —
 * re-POST until `remaining` is 0 for large user bases.
 *
 * POST body: { kind, version, effectiveDate, changes: string[], batchSize?, dryRun? }
 */
export async function POST(req: NextRequest) {
  if (!authGuard(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const kind = body.kind as LegalUpdateKind
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${VALID_KINDS.join(", ")}` }, { status: 400 })
  }

  const version = typeof body.version === "string" ? body.version.trim() : ""
  if (!version) {
    return NextResponse.json({ error: "version is required (e.g. \"2026-08-01\")" }, { status: 400 })
  }

  const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate.trim() : ""
  if (!effectiveDate) {
    return NextResponse.json({ error: "effectiveDate is required (e.g. \"August 1, 2026\")" }, { status: 400 })
  }

  const changes = Array.isArray(body.changes)
    ? body.changes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : []
  if (!changes.length) {
    return NextResponse.json({ error: "changes must be a non-empty array of strings" }, { status: 400 })
  }

  const result = await sendLegalUpdateBroadcast({
    kind,
    version,
    effectiveDate,
    changes,
    batchSize: typeof body.batchSize === "number" ? body.batchSize : undefined,
    dryRun: Boolean(body.dryRun),
  })

  return NextResponse.json({ ok: true, ...result })
}
