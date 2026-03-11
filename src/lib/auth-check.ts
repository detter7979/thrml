import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function requireAuth() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      supabase: null,
    }
  }

  return { error: null, session, supabase }
}
