import Stripe from "stripe"

import { stripe } from "@/lib/stripe"

export type StripeConnectStatus = {
  onboardingComplete: boolean
  payoutsEnabled: boolean
  chargesEnabled: boolean
}

export function getAppUrl(fallbackOrigin?: string) {
  return process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || "http://localhost:3000"
}

export function getStripeOnboardingUrls(appUrl: string) {
  return {
    refreshUrl: `${appUrl}/api/stripe/connect/refresh`,
    returnUrl: `${appUrl}/dashboard/account?stripe=success`,
  }
}

export function mapAccountStatus(account: Stripe.Account): StripeConnectStatus {
  return {
    onboardingComplete: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
    chargesEnabled: Boolean(account.charges_enabled),
  }
}

export async function createOnboardingLink(accountId: string, appUrl: string) {
  const urls = getStripeOnboardingUrls(appUrl)
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding",
  })
}

export function maskStripeAccountId(accountId: string | null | undefined) {
  if (!accountId) return null
  if (accountId.length <= 8) return accountId
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`
}
