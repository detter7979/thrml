import { NextRequest, NextResponse } from "next/server"

import { createOnboardingLink, getAppUrl } from "@/lib/stripe-connect"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL("/login?next=/dashboard/account", req.url)
    return NextResponse.redirect(loginUrl)
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_account_id) {
    const accountUrl = new URL("/dashboard/account?stripe=missing", req.url)
    return NextResponse.redirect(accountUrl)
  }

  const appUrl = getAppUrl(req.nextUrl.origin)
  const accountLink = await createOnboardingLink(profile.stripe_account_id, appUrl)
  return NextResponse.redirect(accountLink.url)
}
