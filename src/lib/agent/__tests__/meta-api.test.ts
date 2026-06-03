import { afterEach, describe, expect, it } from "vitest"

import { getMetaAdAccountId } from "@/lib/agent/meta-api"

describe("getMetaAdAccountId", () => {
  const previous = process.env.META_AD_ACCOUNT_ID

  afterEach(() => {
    if (previous === undefined) delete process.env.META_AD_ACCOUNT_ID
    else process.env.META_AD_ACCOUNT_ID = previous
  })

  it("prefixes numeric account ids with act_", () => {
    process.env.META_AD_ACCOUNT_ID = "883738857991570"
    expect(getMetaAdAccountId()).toBe("act_883738857991570")
  })

  it("keeps act_ prefix when already present", () => {
    process.env.META_AD_ACCOUNT_ID = "act_883738857991570"
    expect(getMetaAdAccountId()).toBe("act_883738857991570")
  })
})
