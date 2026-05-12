# thrml — Static Ad Design System

> Binding spec for static creatives produced for **usethrml.com paid Meta ads**.
> All variants generated via Replicate (imagery) and Claude (copy) MUST conform
> to the Master Ad Template defined here.
>
> Only two fields are mutable per A/B variant: **Background Image Prompt** and
> **Headline**. Every other property is locked.

---

## 1. Master Ad Template

### 1.1 Composition

- **Primary format:** 9:16 vertical (Meta Stories / Reels feed) — `1080 × 1920`
- **Secondary formats:** 1:1 (`1080 × 1080`), 4:5 (`1080 × 1350`) — same locked layout, scaled per the table in §1.4
- **Export:** PNG, sRGB, ≤ 30 MB
- **Layer order (bottom → top):** Background → Overlay gradient → Wordmark → Text stack

### 1.2 Background Layer

- Single full-bleed photographic image, generated with Replicate Flux (`black-forest-labs/flux-schnell`)
- Subjects only: authentic wellness environments — saunas, cold plunges, residential spas
- **Host monetization playbook (§5.5):** Sauna **or** cold plunge must read as the **hero** subject. Prompts use **high-end architectural photography** language and a mandatory **first-person owner POV** (foreground edge of patio, door jamb, window sill, or deck boards — looking *out* toward the equipment). See `trigger_data.static_variations` in production. **People-free:** POV is implied by architecture only (no visible person); this overrides generic Host Variation B face rules for the monetization ladder only.
- Must contain **no text and no logos**. Default rule: **no people in frame**.
  Host Acquisition Variation B is the only approved exception (see §5.3) — it
  may show the host candidly, face permitted.
- Style direction: see [`agents/visual_style.md`](./visual_style.md) ("Residential Premium", PNW lighting, no spa-stock cliches)

### 1.3 Overlay Layer

Linear gradient mask anchored to the bottom edge of the canvas.

| Property   | Value                                                                 |
|---         |---                                                                    |
| Color      | `#121212`                                                             |
| Direction  | top → bottom                                                          |
| Stop 1     | `y = 50%` (vertical midpoint) → opacity `0%`                          |
| Stop 2     | `≈80%` of canvas height (along overlay gradient) → opacity `20%`    |
| Stop 3     | `y = 100%` (bottom edge) → opacity **`50%`** (locked for host monetization legibility) |

No vignettes, color filters, blurs, or additional overlays are permitted.

### 1.4 Text Stack (bottom 1/3, left-aligned)

| Element       | Font                | Weight   | Color     | Case          | Size (9:16) | Size (1:1) | Size (4:5) | Opacity |
|---            |---                  |---       |---        |---            |---:         |---:        |---:        |---:     |
| Headline      | Cormorant Garamond  | 400      | `#FFFFFF` | Sentence case | 88 pt       | 76 pt      | 80 pt      | 100%    |
| Sub-headline  | Inter (Geist as CSS fallback name only) | **500 Medium** | `#A0A0A0` | Sentence case | 30 pt       | 28 pt      | 28 pt      | 100%    |

- Headline anchor: top of the bottom 1/3 of the canvas (`y = 67%` for 9:16 → `y = 1280px`)
- Sub-headline anchor: directly below headline, fixed gap = `24 px`
- **Sub-headline letter-spacing:** `+0.03em` (locked editorial feel)
- Left padding matches the wordmark padding (see §1.5)
- Headline wraps on natural word boundaries, ≤ 3 lines
- Sub-headline wraps on natural word boundaries, ≤ 2 lines
- No drop shadows, no strokes, no italics on the headline; no extra letter-spacing on the headline

> Font pair is locked: **Cormorant Garamond** (display/serif) + **Inter Medium (500)**
> for the sub-headline. Renderer embeds `inter-latin-500-normal.woff2` from
> `@fontsource/inter` alongside Cormorant Garamond 400.

### 1.5 Branding (Wordmark)

| Property        | Value                                                                 |
|---              |---                                                                    |
| Text            | `thrml` (lowercase, never uppercase, never spaced out)                |
| Font            | Same family as headline (Cormorant Garamond)                          |
| Color           | `#FFFFFF`                                                             |
| Opacity         | `80%`                                                                 |
| Position        | Top-left                                                              |
| Padding         | `80 px` from top and left edges (9:16); `64 px` (1:1, 4:5)            |
| Size            | 64 pt (9:16); 56 pt (1:1, 4:5)                                        |
| Letter-spacing  | Tight (`-0.02em`)                                                     |

### 1.6 Locked Properties (do not vary across A/B)

- Aspect ratio and canvas dimensions
- Layer order
- Gradient color, direction, stops, opacities
- Wordmark text, font, color, opacity, position, padding, size, letter-spacing
- Headline and sub-headline font, color, alignment, padding, size, line-height, max line count, case
- Sub-headline **copy** (carried verbatim from the parent brief across all variants in that brief)
- Background image style rules per [`agents/visual_style.md`](./visual_style.md)

---

## 2. Creative Brief Generator (Agent Contract)

### 2.0 Brief priority

When no audience is explicitly specified by the operator, the agent's **default
brief priority is Host Acquisition**. Guest-side variants are generated only
when explicitly requested. See §5 for host-specific creative rules and §6 for
the host variation brief template.

### 2.1 Mutable fields

For every variant the agent (Claude + Replicate) is permitted to mutate **only**:

1. `background_image_prompt` — full natural-language Replicate Flux prompt
2. `headline` — sentence case, ≤ 7 words, ends with a strong noun

The agent **MUST NOT**:

- Change fonts, colors, sizes, padding, opacity, gradient stops, alignments, or layer order
- Add CTA pills, buttons, badges, stickers, decorative shapes, or framing borders
- Generate or composite text inside the background image
- Move, recase, or restyle the wordmark
- Substitute the sub-headline — copy it verbatim from the parent brief
- Switch font pairs within a single creative

### 2.2 Validation rules (machine-checkable)

| Field                       | Rule                                                                                  |
|---                          |---                                                                                    |
| `headline`                  | ≤ 7 words AND ≤ 38 characters **except** approved `static_playbook === host_monetization_v3` lines (§5.5), which are canonical |
| `headline`                  | Sentence case (first letter uppercase, no `ALL CAPS`, no `Title Case Throughout`)     |
| `background_image_prompt`   | For generic briefs: ends with `, no text, no logos, no people, photographic` (or playbook-specific finalized suffix from code) |
| `background_image_prompt`   | Conforms to the "Photo Style — DO" list in `agents/visual_style.md`                   |
| Output PNG dimensions       | Exactly match the declared format (1080×1920 / 1080×1080 / 1080×1350)                 |
| Composition                 | Master Ad Template overlay re-applied; raw Replicate output is never shipped as-is    |

If any check fails, the variant is rejected and re-generated. Failed variants
are logged but not uploaded to GCS or written to `creative_assets`.

### 2.3 Per-brief experiment design

Within one parent brief, generate **N variants** (start with 2, configurable
via `CREATIVE_VARIATIONS`). Each variant differs **only** in the two mutable
fields. Same sub-headline. Same Master Ad Template. This isolates the A/B
signal to imagery + headline.

---

## 3. Variation Brief Template

Copy/paste this block per variant, fill in the two mutable fields, and submit
to the agent. Everything outside the `Mutable fields` section is descriptive
context for the human reviewer — the agent must not modify those values.

```markdown
# Variation Brief

## Identifiers
- variant_id:       v_YYYYMMDD_<slug>
- parent_brief_id:  <uuid>
- format:           9:16
- layout:           master_ad_template

## Mutable fields (the ONLY inputs the agent may change)
- background_image_prompt: |
    <Single paragraph, natural language. Must follow agents/visual_style.md
     "Photo Style — DO" rules. Must end with:
     ", no text, no logos, no people, photographic">
- headline: "<Sentence case, ≤ 7 words, ends on a strong noun>"

## Locked fields (carry verbatim from parent brief / Master Ad Template)
- sub_headline:   "<from parent brief — do not modify>"
- wordmark:       "thrml"
- gradient:       "#121212 — 0% @ y=50%, ~20% mid ramp, 50% @ bottom"
- typography:     "Headline: Cormorant Garamond 400, #FFFFFF, sentence case;
                   Sub-headline: Inter Medium 500, #A0A0A0, +0.03em tracking, sentence case"
- padding:        "80px outer (9:16) / 64px outer (1:1, 4:5)"
- alignment:      "Wordmark top-left; headline + subhead bottom-third, left-aligned"

## Acceptance criteria
- [ ] Headline passes sentence-case + length rules (≤ 7 words, ≤ 38 chars)
- [ ] Background image prompt ends with the locked safety suffix
- [ ] Generated PNG matches declared dimensions exactly
- [ ] Master Ad Template overlay applied; no CTA pill, no extra labels
- [ ] All locked properties unchanged from this template
```

---

## 4. Local preview workflow

To render a variant locally without touching production data or pushing to
Meta, use the preview script:

```bash
cd /Users/dometter/Desktop/thrml
npx tsx scripts/render-design-sample.ts
```

- First run calls Replicate once and caches the clean base photo at `.tmp/design-sample-base-1x1.png`
- Subsequent runs reuse the cached base for free
- Override the base prompt without burning a new API call: edit `SAMPLE_BASE_PROMPT` env var and delete the cached PNG
- Output: `.tmp/design-sample-A-1x1.png`

The preview script is a development harness only. The production composer is
in `src/lib/agent/static-generator.ts` and must be updated to match this spec
before the next batch of paid creatives is generated.

---

## 5. Host Acquisition variants (default audience)

Host Acquisition is the default brief priority (see §2.0). The Master Ad
Template (§1) still applies in full — locked properties stay locked. This
section adds host-specific guidance to the **two mutable fields**
(`background_image_prompt`, `headline`) plus the carried-over sub-headline.

### 5.1 Visual archetype: Owner-POV / Backyard-Pride

The image must read like a **listing photo of a pristine, empty wellness
space** — not a guest using it. Think real-estate / Airbnb hero shot, not
spa marketing.

DO:
- Cedar barrel sauna or cold plunge anchored in a manicured PNW backyard
- Empty, freshly cleaned, professionally framed — like a top-of-listing photo
- Natural light (golden hour, blue hour, misty morning per `agents/visual_style.md`)
- A single folded towel, wooden ladle, or water bottle as a quiet detail

DON'T:
- Guests relaxing in or near the equipment
- Posed smiles, headshot-style portraits, fitness-model bodies
- Faces in Variations A or C — only Variation B may show the host candidly (see §5.3)
- Spa-stock dressing (rolled towels, rose petals, cucumber slices)
- Commercial gym, hotel, or rental-management center vibes

### 5.2 Typography hierarchy

The Master Ad Template typography is locked, but the **content roles** of the
headline and sub-headline shift for host variants:

| Slot         | Role for host variants                                    | Example                          |
|---           |---                                                        |---                               |
| Headline     | Bold, benefit-driven hook                                 | `Earn while you recover.`        |
| Sub-headline | Trust indicator (carried verbatim across variants A/B/C)  | `Vetted guests only. Insured.`   |

Approved sub-headline pool (pick one per parent brief, then lock it):

- `Vetted guests only.`
- `Insurance included.`
- `Vetted guests, insured sessions.`
- `Free hosting tools, real support.`
- `Background-checked guests.`

### 5.3 Standard variation ladder (A / B / C)

Host briefs default to **3 variants**. Each variant is differentiated **only**
through the `background_image_prompt` (not through layout). The Master Ad
Template's gradient, padding, font sizes, and alignment are unchanged across
A / B / C.

| Variant | Archetype                | Background image direction (drives `background_image_prompt`)                                                                                                                                       |
|---      |---                       |---                                                                                                                                                                                                  |
| A       | Product-focused          | Clean, listing-grade hero shot of a sauna or cold plunge. Empty. Symmetrical framing. Soft natural light. No people.                                                                                |
| B       | Lifestyle-Entrepreneur   | Wide backyard wellness setup with the **host candidly mid-action** near it (e.g., glancing at a phone with a booking notification, wiping down a cedar bench, opening the sauna door). Face permitted, candid only — no posed smile, no headshot framing. |
| C       | High-Contrast Text       | Soft-focus / defocused, calm wellness scene (out-of-focus cedar texture, warm bokeh, gentle steam). The image is intentionally low-detail so the locked headline reads as the primary visual layer. |

> Variation B is the **only** approved exception to the Master Ad Template's
> "no people" rule. The host's face may be visible, but only candidly mid-action
> (one subject, mid-task, eyes on the task, never on camera). No posed
> headshots, no smiling-to-camera, no fitness-model body shots. Faces remain
> prohibited in Variations A and C.

Per-variant prompt safety suffixes (override the §2.2 default):

| Variant | Required suffix                                                                                          |
|---      |---                                                                                                       |
| A       | `, no text, no logos, no people, photographic`                                                           |
| B       | `, no text, no logos, single host subject, candid mid-action, eyes on task not on camera, no posed smile, photographic` |
| C       | `, no text, no logos, no people, soft focus, defocused background, shallow depth of field, photographic` |

### 5.4 Headline angles (3 angles × 3 candidate headlines)

Per host brief, the agent generates **3 candidate headlines per angle** (9
candidates total) and the operator picks one headline per variant A / B / C
to ship. All headlines must pass §2.2 validation (sentence case, ≤ 7 words,
≤ 38 chars, ends on a strong noun).

**Angle 1 — Monetization**
- `Earn while you recover.`
- `Your sauna pays for itself.`
- `Turn idle hours into income.`

**Angle 2 — Offsetting Costs**
- `Cover your monthly utilities.`
- `Make your build pay you back.`
- `Offset the cost of ownership.`

**Angle 3 — Community**
- `Open your space to neighbors.`
- `Build your local wellness circle.`
- `Share the ritual you built.`

The agent may propose alternative headlines per angle, but every proposal
must still pass §2.2 validation and remain inside the named angle's intent.

### 5.5 Host monetization "10" test — canonical A / B / C (locked ladder)

When `trigger_data.static_playbook === "host_monetization_v3"` (set automatically
for Meta **HostEarn** winner-variation briefs, or manually on a pending brief),
the pipeline **must not** invent alternate headlines or proof copy for static
generation. Replicate receives one image prompt per row below; the composer
locks **sub-headline** to the proof line for a clean incrementality test against
the prior high performer ("Your backyard sauna can pay for itself").

**Locked proof (sub-headline, all variants):**

> `Hosts on thrml earn an average of $1,200 / month.`

| Label | Segment / play   | Headline (locked) | Visual direction (core — code appends POV + safety) |
|:---:|---|---|-----|
| **A** | Revenue          | `Turn your idle sauna into a $1,200/mo asset.` | Close-up hero on a pristine modern **barrel sauna** at sunset; sauna fills the frame. |
| **B** | Offset / utilities | `Let your sauna pay its own electric bill.` | High-end **backyard circuit**: sauna + **cold plunge**, PNW forest setting, dual heroes. |
| **C** | Passive / recover  | `Earn while you recover.` | Sleek **indoor infrared** sauna in a modern **home gym**; glass cabin is the hero. |

**Prompt rules (Replicate + Midjourney reference):**

- **Hero subject:** Sauna and/or plunge must dominate the frame (never a generic backyard wide shot with tiny equipment).
- **Style:** Always include **high-end architectural photography** phrasing in the finalized prompt.
- **POV:** **First-person owner POV** — camera placed as if standing on a patio, in a doorway, or at a window, looking **out** toward the asset (foreground edge of structure slightly visible, soft bokeh).
- **People:** This ladder is **people-free** (POV implied by framing only). Generic Host Variation B face rules (§5.3) do **not** apply to these three prompts.

Implementation: `src/lib/agent/host-monetization-static.ts` (canonical copy +
`finalizeHostStaticImagePrompt`), merged in `agent-creative-brief` cron, consumed
in `static-generator` `processStaticBrief`.

---

## 6. Host Variation Brief Template

Use this block for host-priority variants. It extends §3 with the host-specific
fields (`audience`, `variant_archetype`, `headline_angle`, archetype-aware
prompt suffix). Sub-headline is locked across A / B / C inside one parent brief.

```markdown
# Host Variation Brief

## Identifiers
- variant_id:        v_YYYYMMDD_<slug>
- parent_brief_id:   <uuid>
- audience:          host_acquisition
- format:            9:16
- layout:            master_ad_template
- variant_archetype: A | B | C   # Product | Lifestyle-Entrepreneur | High-Contrast Text
- headline_angle:    monetization | offsetting_costs | community

## Mutable fields (the ONLY inputs the agent may change)
- background_image_prompt: |
    <Single paragraph, natural language. Must follow agents/visual_style.md
     "Photo Style — DO" and §5.1 (Owner-POV / Backyard-Pride).
     Must end with the archetype-specific safety suffix from §5.3.>
- headline: "<Sentence case, ≤ 7 words, ends on a strong noun;
             must come from §5.4 for the chosen headline_angle>"

## Locked fields (carry verbatim from parent brief / Master Ad Template)
- sub_headline:   "<from §5.2 trust-indicator pool — picked once per parent brief, identical across A/B/C>"
- wordmark:       "thrml"
- gradient:       "#121212 — 0% @ y=50%, ~20% mid ramp, 50% @ bottom"
- typography:     "Headline: Cormorant Garamond 400, #FFFFFF, sentence case;
                   Sub-headline: Inter Medium 500, #A0A0A0, +0.03em tracking, sentence case"
- padding:        "80px outer (9:16) / 64px outer (1:1, 4:5)"
- alignment:      "Wordmark top-left; headline + subhead bottom-third, left-aligned"

## Acceptance criteria
- [ ] Headline passes §2.2 validation AND belongs to the declared headline_angle
- [ ] Background image prompt ends with the archetype-specific suffix from §5.3
- [ ] Variations A and C contain no people; Variation B may show the host
      candidly mid-action (face permitted, no posed smile, no headshot framing)
- [ ] Sub-headline is identical to the other variants of the same parent brief
- [ ] Generated PNG matches declared dimensions exactly
- [ ] Master Ad Template overlay applied; no CTA pill, no extra labels
- [ ] All locked properties unchanged from this template
```

---

## 7. Reconciliation with existing docs

This document is the binding spec for the **Master Ad Template** used in paid
Meta ads. Where it differs from earlier docs, this file wins for paid ads;
the older docs continue to apply to non-paid surfaces.

| Earlier doc                  | Earlier spec                                              | Master Ad Template (this doc)                              |
|---                           |---                                                        |---                                                         |
| `agents/brand.md`            | Wordmark top-right, cream `#F7F3EE`, ≤ 60 px wide         | Wordmark top-left, `#FFFFFF` at 80%, 64 pt (9:16)          |
| `agents/creative.md`         | Gradient `#1A1410` at 75% opacity, bottom 40%             | Gradient `#121212` three-stop to **50%** at bottom, overlay from y=50% (§1.3) |
| `agents/creative.md`         | CTA pill required (rust `#C75B3A`)                        | No CTA pill                                                |
| `agents/creative.md`         | Variation labels A / B / C rendered onto image            | No labels rendered onto the canvas                         |
| `agents/brand.md` typography | DM Serif Display + DM Sans only                           | Cormorant Garamond + **Inter Medium (500)** sub-head (locked) |
| `agents/brand.md` photo rule | "Hands, feet, towels: partial body, never full faces"     | Faces permitted on Host Acquisition Variation B only (§5.3, candid mid-action) |
| `agents/visual_style.md`     | "Person (if present): back to camera or silhouetted"      | Same default. Host Acquisition Variation B may show host candidly mid-action (§5.3) |

`agents/visual_style.md` (Photo Style — DO/DON'T, lighting, residential
premium) remains the source of truth for `background_image_prompt`.
