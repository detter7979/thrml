import { describe, it, expect, vi, beforeEach } from "vitest"
import * as runway from "../runway"

global.fetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  process.env.RUNWAY_API_KEY = "test-key"
  delete process.env.RUNWAY_POV_REFERENCE_IMAGE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
})

describe("runway", () => {
  it("normalizeRunwayRatio maps legacy values", () => {
    expect(runway.normalizeRunwayRatio("768:1280")).toBe("720:1280")
    expect(runway.normalizeRunwayRatio("1280:768")).toBe("1280:720")
  })

  it("generateVideo sends promptImage and normalized ratio", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task_abc123" }),
    } as Response)

    const r = await runway.generateVideo({ prompt: "a sauna in the woods", ratio: "768:1280" })
    expect(r.taskId).toBe("task_abc123")

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.promptImage).toBe(runway.DEFAULT_RUNWAY_POV_REFERENCE_IMAGE_URL)
    expect(body.ratio).toBe("720:1280")
    expect(body.promptText).toBe("a sauna in the woods")
  })

  it("generateVideo throws on API error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response)

    await expect(runway.generateVideo({ prompt: "x" })).rejects.toThrow(/401/)
  })

  it("pollTask returns when status is terminal", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "t", status: "RUNNING", createdAt: "" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "t",
          status: "SUCCEEDED",
          output: ["https://..."],
          createdAt: "",
        }),
      } as Response)

    const r = await runway.pollTask("t", { intervalMs: 10 })
    expect(r.status).toBe("SUCCEEDED")
  })

  it("resolveRunwayApiKey accepts alternate env names", () => {
    delete process.env.RUNWAY_API_KEY
    process.env.RUNWAYML_API_SECRET = " runway-secret "
    expect(runway.resolveRunwayApiKey()).toBe("runway-secret")
    expect(runway.isRunwayConfigured()).toBe(true)
  })
})
