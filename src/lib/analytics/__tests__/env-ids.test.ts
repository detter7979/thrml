import { describe, expect, it } from "vitest"

import {
  normalizeGaMeasurementId,
  normalizeGoogleAdsId,
  normalizeMetaPixelId,
} from "../env-ids"

describe("analytics env id normalizers", () => {
  it("strips quotes from Google Ads id", () => {
    expect(normalizeGoogleAdsId('"AW-18014799415"')).toBe("AW-18014799415")
  })

  it("accepts GA measurement id", () => {
    expect(normalizeGaMeasurementId("G-L20J7S2M51")).toBe("G-L20J7S2M51")
  })

  it("rejects invalid meta pixel ids", () => {
    expect(normalizeMetaPixelId(null)).toBeNull()
    expect(normalizeMetaPixelId("null")).toBeNull()
    expect(normalizeMetaPixelId("abc")).toBeNull()
    expect(normalizeMetaPixelId("883738857991570")).toBe("883738857991570")
  })
})
