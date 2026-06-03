import { describe, expect, it } from "vitest"

import { ctaToMetaEnum, ctaToMetaEnumFromBrief, resolveBriefCtaToken } from "@/lib/agent/meta-cta"

describe("meta-cta", () => {
  it("maps host display CTA List Your Space to SIGN_UP", () => {
    expect(ctaToMetaEnum("List Your Space")).toBe("SIGN_UP")
  })

  it("maps naming token list_now to SIGN_UP", () => {
    expect(ctaToMetaEnum("list_now")).toBe("SIGN_UP")
  })

  it("prefers naming token over display label on brief", () => {
    expect(
      resolveBriefCtaToken({
        cta: "List Your Space",
        trigger_data: { naming: { cta: "list_now" } },
      })
    ).toBe("list_now")
    expect(
      ctaToMetaEnumFromBrief({
        cta: "List Your Space",
        trigger_data: { naming: { cta: "list_now" } },
      })
    ).toBe("SIGN_UP")
  })

  it("defaults unknown labels to SIGN_UP", () => {
    expect(ctaToMetaEnum("Host your sauna today")).toBe("SIGN_UP")
  })
})
