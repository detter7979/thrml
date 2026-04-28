import assert from "node:assert/strict"

import { calculateFees, calculateProtectedBookingCreditCents } from "../src/lib/fees"

function cents(amount: number) {
  return Math.round(amount * 100)
}

{
  const fees = calculateFees(100, 5, 10.5)

  assert.equal(fees.subtotal, 100)
  assert.equal(fees.guestFee, 5)
  assert.equal(fees.hostFee, 10.5)
  assert.equal(fees.guestTotal, 105)
  assert.equal(fees.hostPayout, 89.5)
  assert.equal(cents(fees.guestTotal) - cents(fees.hostPayout), 1550)
}

{
  const fees = calculateFees(100, 0, 0)

  assert.equal(fees.guestTotal, 100)
  assert.equal(fees.hostPayout, 100)
}

{
  const fees = calculateFees(33.335, 5, 10.5)

  assert.equal(cents(fees.subtotal), 3334)
  assert.equal(cents(fees.guestFee), 167)
  assert.equal(cents(fees.hostFee), 350)
  assert.equal(cents(fees.guestTotal), 3501)
  assert.equal(cents(fees.hostPayout), 2984)
}

{
  const fees = calculateFees(100, 5, 10.5)
  const maxCredit = calculateProtectedBookingCreditCents({
    guestTotalCents: cents(fees.guestTotal),
    hostPayoutCents: cents(fees.hostPayout),
    availableCreditCents: 20_00,
  })

  assert.equal(maxCredit, 15_50)
  assert.equal(cents(fees.guestTotal) - maxCredit, cents(fees.hostPayout))
}

{
  const maxCredit = calculateProtectedBookingCreditCents({
    guestTotalCents: 1_00,
    hostPayoutCents: 80,
    availableCreditCents: 1_00,
  })

  assert.equal(maxCredit, 20)
}

console.log("Fee checks passed")
