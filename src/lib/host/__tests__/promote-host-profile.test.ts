import { describe, it, expect } from "vitest"

import { nextHostUiIntent } from "../promote-host-profile"

describe("nextHostUiIntent", () => {
  it("preserves host intent", () => {
    expect(nextHostUiIntent("host")).toBe("host")
  })

  it("preserves both intent", () => {
    expect(nextHostUiIntent("both")).toBe("both")
  })

  it("promotes guest to both", () => {
    expect(nextHostUiIntent("guest")).toBe("both")
    expect(nextHostUiIntent(null)).toBe("both")
    expect(nextHostUiIntent(undefined)).toBe("both")
  })
})
