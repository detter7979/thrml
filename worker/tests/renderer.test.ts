import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import { render } from "../src/renderer.js"
import { templateV1 } from "../src/template.js"

const TEST_BASE_VIDEO = process.env.TEST_BASE_VIDEO

describe.skipIf(!TEST_BASE_VIDEO)("renderer (integration)", () => {
  it("produces an mp4 of non-zero size", async () => {
    const outPath = join("/tmp", `render-test-${Date.now()}.mp4`)
    await render({
      baseVideoPath: TEST_BASE_VIDEO!,
      outputPath: outPath,
      copyText: "pov: you turned your idle sauna\ninto income",
      template: templateV2,
    })
    expect(existsSync(outPath)).toBe(true)
    const stats = await stat(outPath)
    expect(stats.size).toBeGreaterThan(10_000)
  }, 60_000)
})
