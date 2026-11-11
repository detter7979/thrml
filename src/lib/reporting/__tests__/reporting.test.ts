import { describe, expect, it } from "vitest"

import { columnToLetter } from "@/lib/agent/google-sheets-client"
import { GOOGLE_FINAL_URL_SUFFIX, META_URL_TAGS } from "@/lib/attribution/url-params"
import { parseUtmCookie, utmBookingColumns, utmFromSearchParams } from "@/lib/attribution/utm-cookie"

import { googleConversionEvent } from "../fetch-platforms"
import { SPEND_COLUMN_LETTER, UNIFIED_HEADERS, datesBetween, toCsv } from "../unified"

describe("unified report columns", () => {
  it("keeps spend in column AB for the Finance Tracker P&L", () => {
    const i = UNIFIED_HEADERS.indexOf("Spend ($)")
    expect(columnToLetter(i)).toBe(SPEND_COLUMN_LETTER)
    expect(SPEND_COLUMN_LETTER).toBe("AB")
    expect(UNIFIED_HEADERS[0]).toBe("Date")
  })
  it("lists every day in a range", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
  })
  it("escapes CSV cells", () => {
    expect(toCsv([["a,b", 'say "hi"', 3]])).toBe('"a,b","say ""hi""",3')
  })
})

describe("google conversion actions", () => {
  it("maps action names to events", () => {
    expect(googleConversionEvent("thrml - Purchase")).toBe("PUR")
    expect(googleConversionEvent("Begin checkout")).toBe("IC")
    expect(googleConversionEvent("View listing")).toBe("VC")
    expect(googleConversionEvent("host_onboarding_started")).toBe("HO")
    expect(googleConversionEvent("become_host_click")).toBe("BH")
    expect(googleConversionEvent("host_first_listing_created")).toBe("NL")
    expect(googleConversionEvent("Page scroll")).toBeNull()
  })
})

describe("utm cookie", () => {
  it("reads utms and a click id from the landing URL", () => {
    const u = utmFromSearchParams(new URLSearchParams("utm_source=meta&utm_content=1201&fbclid=abc&x=1"))
    expect(u).toEqual({ utm_source: "meta", utm_content: "1201", click_id: "fbclid:abc" })
    expect(utmFromSearchParams(new URLSearchParams("ref=friend"))).toBeNull()
  })
  it("ad URL templates put the IDs where the report joins on them", () => {
    const meta = new URLSearchParams(META_URL_TAGS)
    expect(meta.get("utm_source")).toBe("meta")
    expect(meta.get("utm_content")).toBe("{{ad.id}}")
    expect(meta.get("utm_term")).toBe("{{adset.id}}")
    expect(meta.get("utm_id")).toBe("{{campaign.id}}")
    const google = new URLSearchParams(GOOGLE_FINAL_URL_SUFFIX)
    expect(google.get("utm_source")).toBe("google")
    expect(google.get("utm_content")).toBe("{creative}")
    expect(google.get("utm_term")).toBe("{adgroupid}")
    // A clicked Meta ad lands with every key the cookie and the report read.
    const landed = utmFromSearchParams(
      new URLSearchParams(META_URL_TAGS.replace("{{campaign.name}}", "C001_test").replace(/\{\{[a-z.]+\}\}/g, "120"))
    )
    expect(Object.keys(landed ?? {}).sort()).toEqual(["utm_campaign", "utm_content", "utm_id", "utm_medium", "utm_source", "utm_term"])
  })
  it("round-trips the cookie into booking columns", () => {
    const raw = encodeURIComponent(JSON.stringify({ utm_content: "1201", utm_term: "99", evil: "x" }))
    const cols = utmBookingColumns(parseUtmCookie(raw))
    expect(cols.utm_content).toBe("1201")
    expect(cols.utm_term).toBe("99")
    expect(cols.utm_source).toBeNull()
    expect(parseUtmCookie("not json")).toEqual({})
  })
})

describe("master report pivots", () => {
  it("only reference real Master Data columns", async () => {
    const { PIVOTS } = await import("../master-report")
    for (const p of PIVOTS) {
      for (const r of p.rows) expect(UNIFIED_HEADERS).toContain(r)
      for (const v of p.values) {
        if (v.sum) expect(UNIFIED_HEADERS).toContain(v.sum)
        for (const m of v.formula?.matchAll(/SUM\('([^']+)'\)/g) ?? []) expect(UNIFIED_HEADERS).toContain(m[1])
      }
    }
  })
})
