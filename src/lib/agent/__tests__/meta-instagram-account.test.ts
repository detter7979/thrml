import { afterEach, describe, expect, it, vi } from "vitest"

import {
  fetchAdAccountInstagramAccounts,
  fetchPageInstagramBusinessAccountId,
  resolveMetaInstagramActorId,
} from "@/lib/agent/meta-instagram-account"

describe("meta-instagram-account", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("returns instagram_business_account id from page fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("instagram_business_account")) {
          return new Response(
            JSON.stringify({ instagram_business_account: { id: "17841400011111111" } })
          )
        }
        return new Response(JSON.stringify({ data: [] }))
      })
    )

    const result = await fetchPageInstagramBusinessAccountId("page-1", "token")
    expect(result.id).toBe("17841400011111111")
  })

  it("prefers ad account instagram over mismatched env", async () => {
    vi.stubEnv("META_PAGE_ID", "993379153864495")
    vi.stubEnv("META_AD_ACCOUNT_ID", "act_123")
    vi.stubEnv("META_INSTAGRAM_ACCOUNT_ID", "99999999999999999")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/act_123/instagram_accounts")) {
          return new Response(
            JSON.stringify({
              data: [{ id: "17841400022222222", username: "usethrml" }],
            })
          )
        }
        if (url.includes("instagram_business_account")) {
          return new Response(
            JSON.stringify({
              error: {
                message: "requires pages_read_engagement",
                code: 100,
              },
            }),
            { status: 400 }
          )
        }
        return new Response(JSON.stringify({ data: [] }))
      })
    )

    const resolved = await resolveMetaInstagramActorId({
      pageId: "page-1",
      adAccountId: "act_123",
      token: "token",
    })
    expect(resolved.id).toBe("17841400022222222")
    expect(resolved.source).toBe("ad_account")
    expect(resolved.pagePermissionDenied).toBe(true)
  })

  it("loads instagram accounts from ad account edge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "17841400033333333", username: "usethrml" }],
          })
        )
      )
    )

    const result = await fetchAdAccountInstagramAccounts("act_999", "token")
    expect(result.accounts[0]?.id).toBe("17841400033333333")
  })
})
