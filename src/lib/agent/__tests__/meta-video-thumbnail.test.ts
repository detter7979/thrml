import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/agent/meta-api", () => ({
  META_GRAPH_BASE: "https://graph.example",
  getMetaMarketingApiToken: () => "t",
  getMetaAdAccountId: () => "act_1",
}))

import { fetchVideoThumbnail, videoThumbnailFields } from "@/lib/agent/meta-video-upload"

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

afterEach(() => vi.unstubAllGlobals())

describe("video thumbnail", () => {
  it("uses the image hash when Meta returns one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ image_hash: "abc", uri: "https://x/1.jpg", is_preferred: true }] })))
    const t = await fetchVideoThumbnail("v1", { attempts: 1 })
    expect(videoThumbnailFields(t)).toEqual({ image_hash: "abc" })
  })

  it("falls back to the thumbnail URL when the hash is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ image_hash: null, uri: "https://x/1.jpg", is_preferred: true }] })))
    const t = await fetchVideoThumbnail("v1", { attempts: 1 })
    expect(videoThumbnailFields(t)).toEqual({ image_url: "https://x/1.jpg" })
  })

  it("falls back to the video picture when there are no thumbnail rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("/thumbnails") ? json({ data: [] }) : json({ picture: "https://x/p.jpg" })))
    )
    const t = await fetchVideoThumbnail("v1", { attempts: 1 })
    expect(videoThumbnailFields(t)).toEqual({ image_url: "https://x/p.jpg" })
  })

  it("refuses to build a creative with no thumbnail", () => {
    expect(() => videoThumbnailFields({})).toThrow(/thumbnail/)
  })
})
