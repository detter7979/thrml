import { describe, expect, it } from "vitest"

import { mergeRunwayEditPrompt } from "../video-runway-edit"

describe("mergeRunwayEditPrompt", () => {
  it("appends edit notes to the base prompt", () => {
    expect(mergeRunwayEditPrompt("POV walk toward sauna", "slower motion")).toBe(
      "POV walk toward sauna. slower motion"
    )
  })

  it("returns edit only when base is empty", () => {
    expect(mergeRunwayEditPrompt("", "more mist")).toBe("more mist")
  })
})
