/**
 * Host Acquisition — monetization static ladder ("10" test phase).
 * See `agents/design.md` §5 / host monetization playbook.
 */

export const HOST_MONETIZATION_PLAYBOOK_ID = "host_monetization_v3" as const

/** Locked proof line for Meta host monetization tests (control variable). */
export const HOST_PROOF_SUBTEXT = "Hosts on thrml earn an average of $1,200 / month."

export type HostMonetizationVariation = {
  variation_label: "A" | "B" | "C"
  headline: string
  /** Core scene description; `finalizeHostStaticImagePrompt` appends POV + safety clauses. */
  background_image_prompt: string
}

export const HOST_MONETIZATION_CANONICAL_VARIATIONS: readonly HostMonetizationVariation[] = [
  {
    variation_label: "A",
    headline: "Turn your idle sauna into a $1,200/mo asset.",
    background_image_prompt:
      "Extreme close-up hero shot of a pristine modern cedar barrel sauna at golden sunset, warm rim light on vertical staves and brushed stainless hardware, shallow depth of field, sauna fills the frame as the unmistakable focal subject",
  },
  {
    variation_label: "B",
    headline: "Let your sauna pay its own electric bill.",
    background_image_prompt:
      "High-end residential backyard wellness circuit: compact Nordic sauna cabin beside a cedar cold plunge tub, dense Pacific Northwest evergreen forest beyond the fence, mist in the trees, wet stone pavers, both sauna and plunge equally sharp as dual hero subjects",
  },
  {
    variation_label: "C",
    headline: "Earn while you recover.",
    background_image_prompt:
      "Sleek full-glass indoor infrared sauna in a modern home gym, matte black frame, towel on bench, dumbbell rack softly out of focus in foreground, sauna cabin glowing gently as the clear hero subject",
  },
] as const

const POV_AND_STYLE_SUFFIX =
  ", photorealistic, high-end architectural photography, first-person owner point of view from just inside a covered patio, an open sliding door, or a tall window frame in the immediate foreground (door jamb, sill, or deck boards slightly visible and softly out of focus), sightline looking outward so the sauna or cold plunge is the dominant hero subject in the composition, natural editorial light, no staged stock props, no text, no logos, no signage, no watermarks, no people, no faces"

export function finalizeHostStaticImagePrompt(fragment: string): string {
  return `${fragment.trim()}${POV_AND_STYLE_SUFFIX}`
}

export function matchesHostMonetizationPlaybook(
  triggerData: unknown,
  triggerType?: string | null,
): boolean {
  if (!triggerData || typeof triggerData !== "object") return false
  const o = triggerData as Record<string, unknown>
  if (o.static_playbook === HOST_MONETIZATION_PLAYBOOK_ID) return true
  if (triggerType === "winner_variation" && o.hook === "HostEarn") return true
  return false
}

export type StoredStaticVariation = {
  variation_label: string
  headline: string
  background_image_prompt: string
}

export function parseStoredStaticVariations(triggerData: unknown): StoredStaticVariation[] | null {
  if (!triggerData || typeof triggerData !== "object") return null
  const raw = (triggerData as Record<string, unknown>).static_variations
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: StoredStaticVariation[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const headline = typeof row.headline === "string" ? row.headline.trim() : ""
    const background_image_prompt =
      typeof row.background_image_prompt === "string" ? row.background_image_prompt.trim() : ""
    const rawLabel = typeof row.variation_label === "string" ? row.variation_label.trim().toUpperCase() : ""
    const fallback = (["A", "B", "C"] as const)[Math.min(out.length, 2)]
    const variation_label = /^[ABC]$/.test(rawLabel) ? rawLabel : fallback
    if (!headline || !background_image_prompt) continue
    out.push({ variation_label, headline, background_image_prompt })
  }
  return out.length ? out : null
}

export function buildMonetizationTriggerPatch(
  triggerData: unknown,
  triggerType?: string | null,
): Record<string, unknown> | null {
  if (!matchesHostMonetizationPlaybook(triggerData, triggerType)) return null
  const base = triggerData && typeof triggerData === "object" ? { ...(triggerData as Record<string, unknown>) } : {}
  return {
    ...base,
    static_playbook: HOST_MONETIZATION_PLAYBOOK_ID,
    goal_type: "host",
    static_variations: HOST_MONETIZATION_CANONICAL_VARIATIONS.map((v) => ({
      variation_label: v.variation_label,
      headline: v.headline,
      background_image_prompt: finalizeHostStaticImagePrompt(v.background_image_prompt),
    })),
  }
}
