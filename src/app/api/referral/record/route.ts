import { NextRequest, NextResponse } from "next/server"

import { recordReferral } from "@/lib/referral"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const body = (await req.json().catch(() => null)) as { userId?: string; code?: string } | null
  const userId = typeof body?.userId === "string" ? body.userId : ""
  const code = typeof body?.code === "string" ? body.code : ""

  if (!userId || !code) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (!user?.id || user.id !== userId) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  await recordReferral(userId, code)
  return NextResponse.json({ ok: true })
}
