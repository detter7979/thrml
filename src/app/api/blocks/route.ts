import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAuth } from "@/lib/auth-check"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

const bodySchema = z.object({ userId: z.string().uuid() })

/** Whether I've blocked this person, and whether either of us has blocked the other. */
export async function GET(req: NextRequest) {
  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = req.nextUrl.searchParams.get("userId") ?? ""
  if (!bodySchema.safeParse({ userId }).success) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  const me = session.user.id
  const admin = createAdminClient()
  const { data } = await admin
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${me},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${me})`)

  const rows = data ?? []
  return NextResponse.json({
    blockedByMe: rows.some((r) => r.blocker_id === me),
    blockedEitherWay: rows.length > 0,
  })
}

/** Block someone: neither of you can message the other until you unblock. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 30, windowMs: 60 * 60 * 1000, identifier: "blocks" })
  if (limited) return limited

  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid user" }, { status: 400 })
  if (parsed.data.userId === session.user.id) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 })
  }

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_id: session.user.id, blocked_id: parsed.data.userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: "Could not block this person." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Unblock someone you blocked. */
export async function DELETE(req: NextRequest) {
  const { error: authError, session, supabase } = await requireAuth()
  if (authError || !session || !supabase) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", session.user.id)
    .eq("blocked_id", parsed.data.userId)
  if (error) return NextResponse.json({ error: "Could not unblock this person." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
