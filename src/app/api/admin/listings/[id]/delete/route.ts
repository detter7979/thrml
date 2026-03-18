import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

export async function PATCH(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { error: updateError } = await admin
    .from("listings")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("id", id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
