import { describe, it, expect, vi, beforeEach } from "vitest"
import * as runway from "../runway"

global.fetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  process.env.RUNWAY_API_KEY = "test-key"
})

describe("runway", () => {
  it("generateVideo returns task id on success", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task_abc123" }),
    } as Response)

    const r = await runway.generateVideo({ prompt: "a sauna in the woods" })
    expect(r.taskId).toBe("task_abc123")
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
