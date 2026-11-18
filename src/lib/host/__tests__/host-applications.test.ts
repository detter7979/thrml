import { describe, expect, it } from "vitest"

import { applicationRow, hostApplicationSchema, initialApplicationStatus } from "@/lib/host/host-applications"
import { fetchHostFunnelSettings, hostListingStatusLabel, normalizeApprovalStatus } from "@/lib/host/listing-approval"

const owner = {
  owns_sauna: "yes",
  email: "  Host@Example.com ",
  full_name: "Sam Host",
  neighborhood: "Ballard",
  sauna_type: "Barrel sauna (outdoor)",
  private_access: "yes",
  availability: "3-4",
  phone: "",
  notes: "Cold plunge too",
}

describe("hostApplicationSchema", () => {
  it("accepts a full owner application and normalizes email/empties", () => {
    const parsed = hostApplicationSchema.parse(owner)
    expect(parsed.email).toBe("host@example.com")
    expect(parsed.owns_sauna).toBe("yes")
    if (parsed.owns_sauna === "yes") expect(parsed.phone).toBeNull()
  })

  it("requires the owner questions", () => {
    const result = hostApplicationSchema.safeParse({ ...owner, sauna_type: "", availability: undefined })
    expect(result.success).toBe(false)
  })

  it("lets future hosts leave just an email", () => {
    const parsed = hostApplicationSchema.parse({ owns_sauna: "planning", email: "a@b.co" })
    expect(parsed.owns_sauna).toBe("planning")
    expect(parsed.neighborhood).toBeNull()
  })

  it("rejects unknown answers", () => {
    expect(hostApplicationSchema.safeParse({ owns_sauna: "maybe", email: "a@b.co" }).success).toBe(false)
  })
})

describe("applicationRow", () => {
  it("routes owners to review and everyone else to the future list", () => {
    expect(initialApplicationStatus("yes")).toBe("new")
    expect(initialApplicationStatus("exploring")).toBe("future")
    const row = applicationRow(hostApplicationSchema.parse({ owns_sauna: "exploring", email: "x@y.co" }), null, null)
    expect(row.status).toBe("future")
    expect(row.sauna_type).toBeNull()
  })

  it("never moves a decided applicant backwards when they re-apply", () => {
    const input = hostApplicationSchema.parse(owner)
    expect(applicationRow(input, "founding", null).status).toBe("founding")
    expect(applicationRow(input, "waitlisted", null).status).toBe("waitlisted")
  })

  it("promotes a future lead into review once they own a sauna", () => {
    const input = hostApplicationSchema.parse(owner)
    expect(applicationRow(input, "future", "user-1")).toMatchObject({ status: "new", user_id: "user-1" })
  })
})

describe("listing approval helpers", () => {
  it("labels host listings by approval first", () => {
    expect(hostListingStatusLabel({ is_active: false, approval_status: "pending" })).toBe("Pending review")
    expect(hostListingStatusLabel({ is_active: false, approval_status: "declined" })).toBe("Not approved")
    expect(hostListingStatusLabel({ is_active: true, approval_status: "approved" })).toBe("Live")
    expect(hostListingStatusLabel({ is_active: false })).toBe("Draft")
  })

  it("treats a missing column as approved (pre-migration safety)", () => {
    expect(normalizeApprovalStatus(undefined)).toBe("approved")
  })

  it("reads the funnel switches from platform_settings", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [
              { key: "require_listing_approval", value: true },
              { key: "host_applications_mode", value: "false" },
            ],
          }),
        }),
      }),
    }
    await expect(fetchHostFunnelSettings(admin as never)).resolves.toEqual({
      requireListingApproval: true,
      hostApplicationsMode: false,
    })
  })
})
