import assert from "node:assert/strict"

import {
  cashPlatformTakeCents,
  grossPlatformTakeCents,
  promoCreditsAppliedCents,
} from "@/lib/finance/booking-economics"

{
  const row = {
    total_charged: 90,
    host_payout: 89.5,
    guest_fee: 5,
    host_fee: 10.5,
    referral_credit_applied_cents: 1500,
    user_credit_applied_cents: 0,
  }
  assert.equal(cashPlatformTakeCents(row), 50)
  assert.equal(grossPlatformTakeCents(row), 1550)
  assert.equal(promoCreditsAppliedCents(row), 1500)
}

console.log("booking-economics checks passed")
