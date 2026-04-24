import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/** Applied to every Checkout Session we create so guests can enter promotion codes. */
export const DEFAULT_CHECKOUT_SESSION_OPTIONS = {
  allow_promotion_codes: true,
} as const satisfies Pick<Stripe.Checkout.SessionCreateParams, "allow_promotion_codes">

export function mergeCheckoutSessionParams(
  params: Stripe.Checkout.SessionCreateParams
): Stripe.Checkout.SessionCreateParams {
  return {
    ...DEFAULT_CHECKOUT_SESSION_OPTIONS,
    ...params,
    allow_promotion_codes: true,
  }
}

export async function createThrmlCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  return stripe.checkout.sessions.create(mergeCheckoutSessionParams(params))
}
