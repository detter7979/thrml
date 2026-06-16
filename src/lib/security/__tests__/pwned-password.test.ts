import { describe, expect, it } from "vitest"

import { checkPwnedPassword } from "../pwned-password"

describe("checkPwnedPassword", () => {
  it('returns pwned: true for "password"', async () => {
    const result = await checkPwnedPassword("password")
    expect(result.pwned).toBe(true)
    expect(result.errored).toBe(false)
  })

  it("returns pwned: false for a long random string", async () => {
    const result = await checkPwnedPassword("xK9!mQ2@vR7#nL4$wP8&zT1")
    expect(result.pwned).toBe(false)
    expect(result.errored).toBe(false)
  })
})
