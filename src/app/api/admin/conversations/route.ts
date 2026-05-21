import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { resolveAdminConversation } from "@/lib/admin/conversations"
import { requireAdminApi } from "@/lib/admin-guard"

const payloadSchema = z.object({
  recipient: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
  const { error, admin, user } = await requireAdminApi()
  if (error || !admin || !user) return error

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const result = await resolveAdminConversation(admin, user.id, parsed.data.recipient)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    conversationId: result.conversationId,
    created: result.created,
  })
}
