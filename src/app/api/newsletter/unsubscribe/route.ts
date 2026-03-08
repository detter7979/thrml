import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!VALID_EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from("newsletter_subscribers")
      .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
      .eq("email", email)

    if (error) {
      throw error
    }

    return NextResponse.json({ message: "Unsubscribed" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[newsletter/unsubscribe] unexpected error", { error: message })
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
