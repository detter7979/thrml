import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const updatePayload: Record<string, unknown> = {
    is_active: true,
    deactivated_at: null,
    deactivated_reason: null,
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", id)
      .eq("host_id", user.id)
    if (!error) return NextResponse.json({ success: true })

    const message = error.message ?? ""
    const missingColumnMatch = message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]
    if (!missingColumn || !(missingColumn in updatePayload)) {
      return NextResponse.json({ error: message || "Unable to reactivate listing" }, { status: 500 })
    }
    delete updatePayload[missingColumn]
  }

  return NextResponse.json({ error: "Unable to reactivate listing" }, { status: 500 })
}
