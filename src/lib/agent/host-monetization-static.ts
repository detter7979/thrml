/**
 * Host Acquisition — monetization static ladder ("10" test phase).
 * See `agents/design.md` §5 / host monetization playbook.
 */

import { DEFAULT_HOST_HEADLINE } from "@/lib/agent/svg-template-shared"

export const HOST_MONETIZATION_PLAYBOOK_ID = "host_monetization_v3" as const

/** Locked proof line for Meta host monetization tests (control variable). */
export const HOST_PROOF_SUBTEXT = "Hosts on thrml earn an average of $1,200 / month."

export type HostMonetizationVariation = {
  variation_label: "A" | "B" | "C"
  headline: string
  /** Core scene description; `finalizeHostStaticImagePrompt` appends realism + safety clauses. */
  background_image_prompt: string
}

export const HOST_MONETIZATION_CANONICAL_VARIATIONS: readonly HostMonetizationVariation[] = [
  {
    variation_label: "A",
    headline: DEFAULT_HOST_HEADLINE,
    background_image_prompt:
      "Close exterior detail of a cedar barrel sauna on a residential Pacific Northwest deck, vertical staves and brushed stainless door hardware in sharp focus, natural cedar grain with subtle knots, soft overcast afternoon light, 85mm lens shallow depth of field, sauna exterior fills most of the frame as the hero subject",
  },
  {
    variation_label: "B",
    headline: "Let your sauna pay its own electric bill.",
    background_image_prompt:
      "High-end residential backyard wellness setup with a compact Nordic sauna cabin beside a cedar cold plunge tub, wet stone pavers, dense evergreen trees beyond a cedar fence, even overcast daylight, both sauna and plunge sharp as dual hero subjects, believable private home not a resort",
  },
  {
    variation_label: "C",
    headline: "Earn while you recover.",
    background_image_prompt:
      "Indoor infrared sauna with matte black glass frame in a modern home gym, one folded towel on the bench, dumbbell rack softly blurred in foreground, even natural window light, glass cabin readable as the hero subject, authentic lived-in gym not a showroom",
  },
] as const

const REALISM_AND_SAFETY_SUFFIX =
  ", editorial residential architectural photograph in the style of Dwell or Architectural Digest, medium telephoto lens (85mm equivalent) not wide-angle, natural wood grain with subtle knots and authentic material texture, soft realistic Pacific Northwest daylight without lens flare blown highlights or fantasy glow, slight film grain, believable manicured Seattle-area backyard, luxurious but authentic not CGI stock render or 3D visualization, no HDR orange-teal grade, optional soft bokeh of deck boards or fence rail at the frame edge with the sauna still the clear hero subject, no staged spa props, no text, no logos, no signage, no watermarks, no people, no faces"

export function finalizeHostStaticImagePrompt(fragment: string): string {
  const trimmed = fragment.trim()
  if (trimmed.includes("luxurious but authentic not CGI")) return trimmed
  return `${trimmed}${REALISM_AND_SAFETY_SUFFIX}`
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
