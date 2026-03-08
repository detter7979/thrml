import { NextResponse } from "next/server"

import { stripe } from "@/lib/stripe"
import { mapAccountStatus } from "@/lib/stripe-connect"
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

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        onboarding_complete: false,
        payouts_enabled: false,
        charges_enabled: false,
      })
    }
    const isMockHost = profile.stripe_account_id?.startsWith("acct_mock_")
    if (isMockHost) {
      return NextResponse.json({
        onboarding_complete: true,
        payouts_enabled: true,
        charges_enabled: true,
      })
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const status = mapAccountStatus(account)

    await admin
      .from("profiles")
      .update({
        stripe_onboarding_complete: status.onboardingComplete,
        stripe_payouts_enabled: status.payoutsEnabled,
        stripe_charges_enabled: status.chargesEnabled,
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    return NextResponse.json({
      onboarding_complete: status.onboardingComplete,
      payouts_enabled: status.payoutsEnabled,
      charges_enabled: status.chargesEnabled,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Stripe Connect status."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
