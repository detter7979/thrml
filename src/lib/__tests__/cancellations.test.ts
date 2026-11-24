import { describe, expect, it } from "vitest"

import { computeRefund, getPolicyTimeline } from "@/lib/cancellations"
import { CANCELLATION_POLICIES } from "@/lib/constants/cancellation-policies"
import { sessionInstant } from "@/lib/session-time"

const now = new Date("2026-12-01T18:00:00Z") // Tue Dec 1, 10 AM Seattle
const booking = { totalCharged: 73.5, serviceFee: 3.5 } // $70 subtotal + $3.50 fee
const startIn = (hours: number) => new Date(now.getTime() + hours * 3600_000)

describe("computeRefund", () => {
  it.each([
    ["flexible", 25, 70, "flexible_full_refund"],
    ["flexible", 23, 35, "flexible_partial_refund"],
    ["moderate", 49, 70, "moderate_full_refund"],
    ["moderate", 47, 35, "moderate_partial_refund"],
    ["strict", 73, 70, "strict_full_refund"],
    ["strict", 71, 0, "strict_no_refund"],
  ])("%s policy, guest cancels %ih out → $%d", (policy, hours, amount, applied) => {
    const result = computeRefund({ cancelledBy: "guest", policy, sessionStart: startIn(hours), now, ...booking })
    expect(result.refundAmount).toBe(amount)
    expect(result.policyApplied).toBe(applied)
  })

  it("refunds the host's guest in full, including the service fee", () => {
    const result = computeRefund({ cancelledBy: "host", policy: "strict", sessionStart: startIn(2), now, ...booking })
    expect(result.refundAmount).toBe(73.5)
  })

  it("measures from the original time after a guest reschedules to a later date", () => {
    const result = computeRefund({
      cancelledBy: "guest",
      policy: "moderate",
      sessionStart: startIn(24 * 10),
      refundAnchor: startIn(30),
      now,
      ...booking,
    })
    expect(result.refundAmount).toBe(35)
  })

  it("uses Seattle time for the session, not server time", () => {
    // Session Wed Dec 2 at 9 AM Seattle = 23h away. Read as UTC it would look 31h away.
    const result = computeRefund({
      cancelledBy: "guest",
      policy: "flexible",
      sessionStart: sessionInstant("2026-12-02", "09:00:00"),
      now,
      ...booking,
    })
    expect(result.policyApplied).toBe("flexible_partial_refund")
  })
})

describe("getPolicyTimeline", () => {
  it("matches the windows shown on listings", () => {
    expect(CANCELLATION_POLICIES.flexible.refundWindow).toContain(String(getPolicyTimeline("Flexible").fullRefundCutoffHours))
    expect(CANCELLATION_POLICIES.moderate.refundWindow).toContain(String(getPolicyTimeline("Moderate").fullRefundCutoffHours))
    expect(CANCELLATION_POLICIES.strict.refundWindow).toContain(String(getPolicyTimeline("Strict").fullRefundCutoffHours))
  })
})

describe("computeRefund no-shows", () => {
  it("gives no refund once the session has started", () => {
    const result = computeRefund({ cancelledBy: "guest", policy: "flexible", sessionStart: startIn(-1), now, ...booking })
    expect(result.refundAmount).toBe(0)
  })
})
