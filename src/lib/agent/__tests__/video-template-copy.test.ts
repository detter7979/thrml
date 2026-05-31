import { describe, it, expect } from "vitest"

import {
  DEFAULT_POV_VIDEO_COPY,
  DEFAULT_POV_VIDEO_OVERLAY,
  DEFAULT_POV_SAUNA_TEMPLATE_VERSION,
  formatPovVideoOverlay,
} from "../video-template-copy"

describe("video-template-copy", () => {
  it("uses template v2 as POV sauna default", () => {
    expect(DEFAULT_POV_SAUNA_TEMPLATE_VERSION).toBe(2)
  })

  it("formats single-line POV copy into two overlay lines", () => {
    expect(formatPovVideoOverlay(DEFAULT_POV_VIDEO_COPY)).toBe(DEFAULT_POV_VIDEO_OVERLAY)
  })

  it("preserves explicit newlines", () => {
    expect(formatPovVideoOverlay("line one\nline two")).toBe("line one\nline two")
  })
})
