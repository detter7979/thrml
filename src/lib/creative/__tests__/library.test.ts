import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/agent/gcs", () => ({
  copyCreativeObjectToVersionedPath: vi.fn(),
  getSignedGcsReadUrl: vi.fn(),
}))

import { libraryPathFor } from "../library"

describe("libraryPathFor", () => {
  it("moves a dated composite into year/persona/angle named after the ad", () => {
    expect(
      libraryPathFor("gs://thrml/2026/06/hosts/pov_earnings/Static/composite/split_header/A_9x16.png", {
        name: "AD007_T05_A_pov_earnings_Static_9x16_list_now",
        variant: "A",
        format: "9x16",
        template: "split_header",
      })
    ).toBe("2026/hosts/pov_earnings/Static/composite/AD007_T05_A_pov_earnings_Static_9x16_list_now.png")
  })

  it("moves base photos into base/", () => {
    expect(
      libraryPathFor("gs://thrml/2026/06/hosts/pov_earnings/Static/base/split_header/base_A_1x1.png", {
        name: "T05_A_pov_earnings_Static_1x1_list_now",
        variant: "A",
        format: "1x1",
        template: "split_header",
        stage: "base",
      })
    ).toBe("2026/hosts/pov_earnings/Static/base/base_T05_A_pov_earnings_Static_1x1_list_now.png")
  })

  it("leaves files already in the library layout alone", () => {
    expect(
      libraryPathFor("gs://thrml/2026/hosts/pov_earnings/Static/composite/AD007_x_v1.png", {
        name: "AD007_x",
        variant: "A",
        format: "1x1",
        template: null,
      })
    ).toBeNull()
  })
})
