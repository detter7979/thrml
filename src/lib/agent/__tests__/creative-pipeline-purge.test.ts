import { describe, expect, it } from "vitest"

import {
  isGeneratedCreativeObjectPath,
  isPreservedCreativeObjectPath,
} from "@/lib/agent/creative-pipeline-purge"

describe("creative pipeline purge paths", () => {
  it("preserves any path with base in the name", () => {
    expect(isPreservedCreativeObjectPath("2026/05/hosts/pov_earnings/Video/base_sauna_v1.mp4")).toBe(true)
    expect(isPreservedCreativeObjectPath("bases/2026/05/pov-earnings/sauna_v1.mp4")).toBe(true)
    expect(isPreservedCreativeObjectPath("2026/05/hosts/pov_earnings/Static/base_A_9x16.png")).toBe(true)
  })

  it("marks generated static and rendered video paths for deletion", () => {
    expect(isGeneratedCreativeObjectPath("2026/05/hosts/pov_earnings/Static/A_9x16.png")).toBe(true)
    expect(isGeneratedCreativeObjectPath("2026/05/hosts/pov_earnings/Video/pov-idle-income_9x16_v1.mp4")).toBe(
      true
    )
    expect(isGeneratedCreativeObjectPath("renders/2026/05/pov-earnings/pov-idle-income_v1.mp4")).toBe(true)
  })

  it("does not delete paths with base in the name", () => {
    expect(isGeneratedCreativeObjectPath("2026/05/hosts/pov_earnings/Video/base_sauna_v1.mp4")).toBe(false)
    expect(isGeneratedCreativeObjectPath("bases/2026/05/pov-earnings/sauna_v1.mp4")).toBe(false)
    expect(isGeneratedCreativeObjectPath("2026/05/hosts/pov_earnings/Static/base_A_9x16.png")).toBe(false)
  })
})
