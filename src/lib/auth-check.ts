import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function requireAuth() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      supabase: null,
    }
  }

  return {
    error: null,
    session: { user },
    supabase,
  }
}
