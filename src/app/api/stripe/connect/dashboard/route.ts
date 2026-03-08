import { NextResponse } from "next/server"

import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.stripe_account_id) {
      return NextResponse.json({ error: "Stripe account not connected." }, { status: 400 })
    }

    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id)
    return NextResponse.json({ url: loginLink.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open Stripe dashboard."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
