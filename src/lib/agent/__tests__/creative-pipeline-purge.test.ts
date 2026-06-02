import { describe, expect, it } from "vitest"

import {
  isGeneratedCreativeObjectPath,
  isPreservedCreativeObjectPath,
} from "@/lib/agent/creative-pipeline-purge"

function collectBriefGcsPathsForTest(
  assets: Array<{ gcs_path: string | null; performance_data: Record<string, unknown> | null }>,
  jobs: Array<{ rendered_gcs_path: string | null }>,
) {
  const paths = new Set<string>()
  for (const asset of assets) {
    if (asset.gcs_path) paths.add(asset.gcs_path.replace(/^gs:\/\/[^/]+\//, ""))
  }
  for (const job of jobs) {
    if (job.rendered_gcs_path) paths.add(job.rendered_gcs_path)
  }
  const generated: string[] = []
  const preserved: string[] = []
  for (const objectPath of paths) {
    if (isPreservedCreativeObjectPath(objectPath)) preserved.push(objectPath)
    else if (isGeneratedCreativeObjectPath(objectPath)) generated.push(objectPath)
  }
  return { generated, preserved }
}

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

  it("keeps base uploads but deletes composited outputs for a brief", () => {
    const { generated, preserved } = collectBriefGcsPathsForTest(
      [{ gcs_path: "gs://thrml/2026/05/hosts/pov_earnings/Video/base_sauna_v1.mp4", performance_data: null }],
      [{ rendered_gcs_path: "2026/06/hosts/pov_earnings/Video/pov-idle-income_9x16_v2.mp4" }],
    )
    expect(preserved).toEqual(["2026/05/hosts/pov_earnings/Video/base_sauna_v1.mp4"])
    expect(generated).toEqual(["2026/06/hosts/pov_earnings/Video/pov-idle-income_9x16_v2.mp4"])
  })
})
