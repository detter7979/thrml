import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { invalidatePlatformFeePercentsCache, parsePercentFromSetting } from "@/lib/fees"
import { requireAdminApi } from "@/lib/admin-guard"

const DEFAULT_SETTINGS = {
  instant_book_enabled: true,
  new_host_signups_enabled: true,
  maintenance_mode: false,
} as const

const toggleKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>

const patchKeySchema = z.enum([
  ...toggleKeys,
  "guest_fee_percent",
  "host_fee_percent",
])

const payloadSchema = z.object({
  key: patchKeySchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

function isMissingTableError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes("relation") && lower.includes("platform_settings") && lower.includes("does not exist")
}

function isValidHalfStepPercent(n: number) {
  if (!Number.isFinite(n) || n < 0 || n > 20) return false
  const doubled = n * 2
  return Math.abs(doubled - Math.round(doubled)) < 1e-6
}

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { data, error: queryError } = await admin.from("platform_settings").select("key, value")
  if (queryError) {
    if (isMissingTableError(queryError.message)) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS, platformFees: null })
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const settings = { ...DEFAULT_SETTINGS } as Record<string, string | number | boolean | null>
  for (const row of data ?? []) {
    if (typeof row.key !== "string" || !toggleKeys.includes(row.key as keyof typeof DEFAULT_SETTINGS)) continue
    settings[row.key] = row.value as string | number | boolean | null
  }

  const { data: feeRows, error: feeError } = await admin
    .from("platform_settings")
    .select("key, value, updated_at, updated_by")
    .in("key", ["guest_fee_percent", "host_fee_percent"])

  if (feeError) {
    if (isMissingTableError(feeError.message)) {
      return NextResponse.json({ settings, platformFees: null })
    }
    return NextResponse.json({ error: feeError.message }, { status: 500 })
  }

  const updaterIds = Array.from(
    new Set(
      (feeRows ?? [])
        .map((row) => (typeof row.updated_by === "string" ? row.updated_by : null))
        .filter((id): id is string => Boolean(id))
    )
  )

  let nameById: Record<string, string> = {}
  if (updaterIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", updaterIds)
    for (const p of profiles ?? []) {
      if (typeof p.id === "string") {
        nameById[p.id] = typeof p.full_name === "string" && p.full_name.trim() ? p.full_name : p.id
      }
    }
  }

  function feeMeta(key: "guest_fee_percent" | "host_fee_percent") {
    const row = (feeRows ?? []).find((r) => r.key === key)
    const raw = row?.value
    const parsed = parsePercentFromSetting(raw)
    const updatedBy = typeof row?.updated_by === "string" ? row.updated_by : null
    return {
      value: parsed ?? 0,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
      updated_by: updatedBy,
      updated_by_name: updatedBy ? (nameById[updatedBy] ?? updatedBy) : null,
    }
  }

  const guestMeta = feeMeta("guest_fee_percent")
  const hostMeta = feeMeta("host_fee_percent")
  const hasGuestRow = (feeRows ?? []).some((r) => r.key === "guest_fee_percent")
  const hasHostRow = (feeRows ?? []).some((r) => r.key === "host_fee_percent")
  const platformFees =
    hasGuestRow && hasHostRow
      ? { guest_fee_percent: guestMeta, host_fee_percent: hostMeta }
      : null

  return NextResponse.json({
    settings,
    platformFees,
  })
}

export async function PATCH(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { key, value } = parsed.data

  let storeValue: string | number | boolean | null = value
  if (key === "guest_fee_percent" || key === "host_fee_percent") {
    const n = typeof value === "number" ? value : Number(value)
    if (!isValidHalfStepPercent(n)) {
      return NextResponse.json(
        { error: "Fee must be between 0 and 20 in steps of 0.5." },
        { status: 400 }
      )
    }
    storeValue = n
  }

  const { error: upsertError } = await admin.from("platform_settings").upsert(
    {
      key,
      value: storeValue,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "key" }
  )

  if (upsertError) {
    if (isMissingTableError(upsertError.message)) {
      return NextResponse.json(
        { error: "platform_settings table does not exist. Create it before saving settings." },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  if (key === "guest_fee_percent" || key === "host_fee_percent") {
    invalidatePlatformFeePercentsCache()
  }

  return NextResponse.json({ success: true })
}
