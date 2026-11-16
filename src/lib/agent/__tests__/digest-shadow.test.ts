import { describe, expect, it, vi } from "vitest"

import {
  buildDigestShadowPrompt,
  digestRunResults,
  readGatewayCompletionText,
  runDigestShadow,
  shadowSkipReason,
  type DigestFacts,
} from "@/lib/agent/digest-shadow"

const facts: DigestFacts = {
  date: "2026-11-15",
  netPlatformRevenue: 42.5,
  bookingCount: 2,
  bookingRevenue: 180,
  pendingTickets: 1,
  pendingSocial: 0,
  criticalCount: 0,
  warningCount: 1,
  infoCount: 0,
  alertLines: ["[WARNING] [booking] 1 booking pending host confirmation"],
  agentRunLines: ["finance success"],
}

describe("digest shadow", () => {
  it("stays off unless the flag is exactly 1", () => {
    expect(shadowSkipReason({})).toBe("AGENT_SHADOW_DIGEST is not 1")
    expect(shadowSkipReason({ AGENT_SHADOW_DIGEST: "true" })).toBe("AGENT_SHADOW_DIGEST is not 1")
    expect(shadowSkipReason({ AGENT_SHADOW_DIGEST: "1" })).toBe("AGENT_SHADOW_MODEL is unset")
    expect(
      shadowSkipReason({
        AGENT_SHADOW_DIGEST: "1",
        AGENT_SHADOW_MODEL: "spacexai/grok-4.20-non-reasoning",
      }),
    ).toBe("AI Gateway credentials are unset")
    expect(
      shadowSkipReason({
        AGENT_SHADOW_DIGEST: "1",
        AGENT_SHADOW_MODEL: "spacexai/grok-4.20-non-reasoning",
        AI_GATEWAY_API_KEY: "test-key",
      }),
    ).toBeNull()
  })

  it("puts the model summary beside the template facts", () => {
    const results = digestRunResults(facts, {
      status: "recorded",
      model: "spacexai/grok-4.20-non-reasoning",
      text: "One warning. Two bookings.",
      reason: null,
    })

    expect(results.team).toBe("house")
    expect(results.live.source).toBe("template")
    expect(results.live).not.toHaveProperty("text")
    expect(results.shadow.text).toBe("One warning. Two bookings.")
    expect(JSON.stringify(results.live)).not.toContain("One warning")
  })

  it("asks for a comparison summary from the same numbers", () => {
    const prompt = buildDigestShadowPrompt(facts)
    expect(prompt).toContain("42.5")
    expect(prompt).toContain("New bookings: 2")
    expect(prompt).toContain("comparison summary")
  })

  it("reads string and array completion content", () => {
    expect(readGatewayCompletionText({ choices: [{ message: { content: "  Hello  " } }] })).toBe("Hello")
    expect(
      readGatewayCompletionText({
        choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }],
      }),
    ).toBe("AB")
    expect(readGatewayCompletionText({})).toBe("")
  })

  it("does not call the gateway when the flag is off", async () => {
    const fetchImpl = vi.fn()
    const shadow = await runDigestShadow(facts, {}, fetchImpl)
    expect(shadow.status).toBe("skipped")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("records gateway text and keeps a gateway failure off the thrown path", async () => {
    const env = {
      AGENT_SHADOW_DIGEST: "1",
      AGENT_SHADOW_MODEL: "spacexai/grok-4.20-non-reasoning",
      AI_GATEWAY_API_KEY: "test-key",
    }
    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "All clear." } }] }),
    })
    const recorded = await runDigestShadow(facts, env, okFetch)
    expect(recorded).toMatchObject({ status: "recorded", text: "All clear." })

    const failFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    const failed = await runDigestShadow(facts, env, failFetch)
    expect(failed.status).toBe("failed")
    expect(failed.reason).toBe("AI Gateway returned 401")
    expect(failed.text).toBeNull()
  })
})
