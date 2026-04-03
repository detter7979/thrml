import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { createOnboardingLink, getAppUrl, mapAccountStatus } from "@/lib/stripe-connect"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
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
      .select("id, stripe_account_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    let accountId = profile.stripe_account_id as string | null

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { supabase_user_id: user.id },
      })
      accountId = account.id

      const { error: updateError } = await admin
        .from("profiles")
        .update({ stripe_account_id: account.id, stripe_onboarding_complete: false })
        .eq("id", user.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to save Stripe account." }, { status: 500 })
      }
    }

    const appUrl = getAppUrl(req.nextUrl.origin)
    let accountLink: Stripe.Response<Stripe.AccountLink>
    try {
      accountLink = await createOnboardingLink(accountId, appUrl)
    } catch (linkError) {
      console.error("[stripe/connect] accountLinks.create failed", {
        accountId,
        appUrl,
        error: linkError instanceof Error ? linkError.message : String(linkError),
        cause: linkError instanceof Error ? linkError.cause : undefined,
      })
      throw linkError
    }

    return NextResponse.json({
      url: accountLink.url,
      onboardingUrl: accountLink.url,
      stripeAccountId: accountId,
    })
  } catch (error) {
    console.error("[stripe/connect] POST unhandled error", error)
    const message = error instanceof Error ? error.message : "Stripe Connect setup failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

    const accountId = profile.stripe_account_id as string | null
    if (!accountId) {
      return NextResponse.json({
        connected: false,
        stripeAccountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboarding_complete: false,
        payouts_enabled: false,
        charges_enabled: false,
      })
    }
    const isMockHost = accountId?.startsWith("acct_mock_")
    if (isMockHost) {
      return NextResponse.json({
        connected: true,
        stripeAccountId: accountId,
        chargesEnabled: true,
        payoutsEnabled: true,
        onboarding_complete: true,
        payouts_enabled: true,
        charges_enabled: true,
      })
    }

    const account = await stripe.accounts.retrieve(accountId)
    const status = mapAccountStatus(account)
    const connected = status.payoutsEnabled

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
      connected,
      stripeAccountId: account.id,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      onboarding_complete: status.onboardingComplete,
      payouts_enabled: status.payoutsEnabled,
      charges_enabled: status.chargesEnabled,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check Stripe status."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
