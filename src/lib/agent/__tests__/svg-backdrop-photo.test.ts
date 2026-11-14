import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/agent/gcs", () => ({
  downloadCreativeAsset: vi.fn(async () => ({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    contentType: "image/png",
    filename: "x.png",
    signedUrl: "https://example.com/signed",
  })),
}))

import { resolveSvgBackdropPhotoUrl } from "../svg-template-generator"

describe("resolveSvgBackdropPhotoUrl", () => {
  it("embeds a brief photo as a data URL (resvg cannot fetch remote hrefs)", async () => {
    const url = await resolveSvgBackdropPhotoUrl(
      "thrml_block_split_static",
      "gs://thrml/2026/library/generated/sauna_1.png",
    )
    expect(url.startsWith("data:image/png;base64,")).toBe(true)
  })
})
