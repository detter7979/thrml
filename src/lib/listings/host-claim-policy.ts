export const HOST_CLAIM_GUIDANCE =
  "Describe the space and session experience. Avoid medical, treatment, or health-outcome claims (for example: curing pain, improving skin, or promoting recovery)."

export type HostClaimField = "title" | "description"

export type HostClaimViolation = {
  field: HostClaimField
  matched: string
  label: string
}

type ClaimPattern = {
  label: string
  pattern: RegExp
  fields?: HostClaimField[]
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  { label: "cure/cures", pattern: /\bcures?\b/ },
  {
    label: "medical or therapeutic claims",
    pattern: /\b(medical|clinical|therapeutic) (treatment|benefits?|effects?|outcomes?)\b/,
  },
  { label: "healing claims", pattern: /\b(heal(s|ing|ed)?)\b/ },
  { label: "diagnosis language", pattern: /\bdiagnos\w*\b/ },
  {
    label: "FDA or clinical proof claims",
    pattern: /\b(fda[- ]?approved|clinically proven|scientifically proven)\b/,
  },
  {
    label: "recovery outcome claims",
    pattern:
      /\b(promot(e|es|ing|ed)|boost(s|ed|ing)?|support(s|ed|ing)?|accelerat(e|es|ing|ed)|aid(s|ed|ing)? in) recovery\b/,
  },
  {
    label: "skin improvement claims",
    pattern: /\bimprov(e|es|ing|ed) (skin|appearance|complexion)\b/,
  },
  {
    label: "muscle relaxation claims",
    pattern: /\b(support(s|ed|ing)?|promot(e|es|ing|ed)) muscle relaxation\b/,
  },
  {
    label: "pain relief claims",
    pattern:
      /\b(pain relief|reliev(e|es|ing|ed) (pain|back pain|chronic pain|joint pain|muscle pain|symptoms?))\b/,
  },
  {
    label: "specific pain or symptom targeting",
    pattern: /\b(back pain|chronic pain|joint pain|muscle pain|nerve pain)\b/,
  },
  {
    label: "inflammation claims",
    pattern: /\b(reduce(s|d|ing)? inflammation|anti[- ]?inflammatory)\b/,
  },
  {
    label: "treatment outcome claims",
    pattern:
      /\b(treat(s|ing|ed)?|alleviat(e|es|ing|ed)|eliminat(e|es|ing|ed)) (pain|symptoms?|conditions?|disease|illness|injuries?|arthritis)\b/,
  },
  {
    label: "condition targeting",
    pattern:
      /\bfor (arthritis|fibromyalgia|eczema|psoriasis|insomnia|anxiety|depression|diabetes|migraines?|autoimmune)\b/,
  },
  {
    label: "prescription or physician endorsement",
    pattern: /\b(prescrib(e|ed|ing|es)|doctor recommended|physician recommended)\b/,
  },
]

function normalizeForClaimCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scanField(field: HostClaimField, raw: string | null | undefined): HostClaimViolation[] {
  if (!raw?.trim()) return []

  const normalized = normalizeForClaimCheck(raw)
  if (!normalized) return []

  const violations: HostClaimViolation[] = []

  for (const rule of CLAIM_PATTERNS) {
    if (rule.fields && !rule.fields.includes(field)) continue

    const match = normalized.match(rule.pattern)
    if (!match) continue

    violations.push({
      field,
      matched: match[0],
      label: rule.label,
    })
  }

  return violations
}

export function findHostClaimViolations(input: {
  title?: string | null
  description?: string | null
}): HostClaimViolation[] {
  const seen = new Set<string>()
  const violations: HostClaimViolation[] = []

  for (const violation of [
    ...scanField("title", input.title),
    ...scanField("description", input.description),
  ]) {
    const key = `${violation.field}:${violation.label}:${violation.matched}`
    if (seen.has(key)) continue
    seen.add(key)
    violations.push(violation)
  }

  return violations
}

export function formatHostClaimError(violations: HostClaimViolation[]): string {
  if (violations.length === 0) return ""

  const labels = [...new Set(violations.map((violation) => violation.label))]
  const examples = labels.slice(0, 3).join(", ")

  return `Your listing includes language we can't publish (${examples}). ${HOST_CLAIM_GUIDANCE}`
}

export function assertPublishableListingCopy(input: {
  title?: string | null
  description?: string | null
}): { ok: true } | { ok: false; error: string } {
  const violations = findHostClaimViolations(input)
  if (violations.length === 0) return { ok: true }
  return { ok: false, error: formatHostClaimError(violations) }
}
