import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminApi } from "@/lib/admin-guard"

const DEFAULT_SETTINGS = {
  platform_fee_percent: 12,
  instant_book_enabled: true,
  new_host_signups_enabled: true,
  maintenance_mode: false,
} as const

const allowedKeys = Object.keys(DEFAULT_SETTINGS)

const payloadSchema = z.object({
  key: z.enum(["platform_fee_percent", "instant_book_enabled", "new_host_signups_enabled", "maintenance_mode"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

function isMissingTableError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes("relation") && lower.includes("platform_settings") && lower.includes("does not exist")
}

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { data, error: queryError } = await admin.from("platform_settings").select("key, value")
  if (queryError) {
    if (isMissingTableError(queryError.message)) {
      return NextResponse.json({ settings: DEFAULT_SETTINGS })
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const settings = { ...DEFAULT_SETTINGS } as Record<string, string | number | boolean | null>
  for (const row of data ?? []) {
    if (typeof row.key !== "string" || !allowedKeys.includes(row.key)) continue
    settings[row.key] = row.value as string | number | boolean | null
  }

  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const { key, value } = parsed.data
  const { error: upsertError } = await admin.from("platform_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
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
  return NextResponse.json({ success: true })
}
