import { describe, expect, it } from "vitest"

import { sanitizeLegalBody } from "@/lib/legal/sanitize-legal-body"

describe("sanitizeLegalBody", () => {
  it("removes editorial and engineering notes", () => {
    const input = `## Scope

Some policy text.

---
*[Placement requirement: link this policy from the website footer.]*

More text with [ENGINEERING NOTE: fix CAPI payloads].`

    const result = sanitizeLegalBody(input)
    expect(result).not.toContain("Placement requirement")
    expect(result).not.toContain("ENGINEERING NOTE")
    expect(result).toContain("Some policy text.")
  })

  it("removes trailing horizontal rules and orphaned emphasis markers", () => {
    const input = `## Contact

hello@usethrml.com

---
*`

    const result = sanitizeLegalBody(input)
    expect(result).not.toContain("---")
    expect(result).not.toMatch(/\*\s*$/)
    expect(result).toBe("## Contact\n\nhello@usethrml.com")
  })

  it("removes duplicate title heading when it matches the page title", () => {
    const input = `# Consumer Health Data Privacy Policy

**thrml LLC — usethrml.com**

## 1. Scope

Body copy.`

    const result = sanitizeLegalBody(input, "Consumer Health Data Privacy Policy")
    expect(result).not.toMatch(/^# Consumer Health Data Privacy Policy/)
    expect(result).toContain("## 1. Scope")
  })
})
