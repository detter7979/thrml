import { describe, expect, it, vi } from "vitest"

import { resolveSkillText, skillListed } from "@/lib/agent/skill-route"

const env = {
  AGENT_SHADOW_MODEL: "spacexai/grok-4.20-non-reasoning",
  AI_GATEWAY_API_KEY: "test-key",
}

function claude() {
  return Promise.resolve({
    text: "claude answer",
    inputTokens: 3,
    outputTokens: 4,
  })
}

function gatewayFetch(text: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 401,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  })
}

describe("skill route", () => {
  it("treats an empty list as off", () => {
    expect(skillListed("social", undefined)).toBe(false)
    expect(skillListed("social", "")).toBe(false)
    expect(skillListed("social", "email-inbox, creative")).toBe(false)
    expect(skillListed("creative", "email-inbox, creative")).toBe(true)
    expect(skillListed("disputes", "*")).toBe(true)
  })

  it("returns the Claude text when no skill is listed", async () => {
    const fetchImpl = vi.fn()
    const persist = vi.fn()
    const result = await resolveSkillText({
      skill: "social",
      system: "system",
      prompt: "prompt",
      maxTokens: 100,
      claude,
      env,
      fetchImpl,
      persist,
    })

    expect(result.text).toBe("claude answer")
    expect(result.liveSource).toBe("claude")
    expect(result.shadow).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it("keeps the Claude text and stores a shadow reading", async () => {
    const persist = vi.fn()
    const result = await resolveSkillText({
      skill: "social",
      system: "system",
      prompt: "Write a post",
      maxTokens: 100,
      claude,
      env: { ...env, AGENT_SHADOW_SKILLS: "social" },
      fetchImpl: gatewayFetch("grok draft"),
      persist,
    })

    expect(result.text).toBe("claude answer")
    expect(result.liveSource).toBe("claude")
    expect(result.shadow).toMatchObject({ status: "recorded", text: "grok draft" })
    expect(persist).toHaveBeenCalledWith("social", result.shadow)
  })

  it("uses the gateway text only when the skill is on the live list", async () => {
    const claudeSpy = vi.fn(claude)
    const result = await resolveSkillText({
      skill: "email-inbox",
      system: "system",
      prompt: "Classify",
      maxTokens: 100,
      claude: claudeSpy,
      env: { ...env, AGENT_LIVE_SKILLS: "email-inbox" },
      fetchImpl: gatewayFetch("grok classification"),
      persist: vi.fn(),
    })

    expect(result.text).toBe("grok classification")
    expect(result.liveSource).toBe("gateway")
    expect(claudeSpy).not.toHaveBeenCalled()
  })

  it("falls back to Claude when a live gateway call fails", async () => {
    const result = await resolveSkillText({
      skill: "disputes",
      system: "system",
      prompt: "Classify",
      maxTokens: 100,
      claude,
      env: { ...env, AGENT_LIVE_SKILLS: "disputes" },
      fetchImpl: gatewayFetch("", false),
      persist: vi.fn(),
    })

    expect(result.text).toBe("claude answer")
    expect(result.liveSource).toBe("claude")
    expect(result.shadow?.status).toBe("failed")
  })
})
