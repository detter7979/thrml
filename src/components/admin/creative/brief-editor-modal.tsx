"use client"

import { useMemo } from "react"

import { buildAdName } from "@/lib/agent/naming-builder"

export type BriefVariationRow = {
  variation_label: string
  headline: string
  background_image_prompt: string
}

export type StructuredBriefEditorState = {
  id: string
  trigger_type: string
  status: string
  hypothesis: string
  target_audience: string
  hook: string
  format: string
  visual_direction: string
  copy_primary: string
  copy_headline: string
  copy_subtext: string
  cta: string
  campaign_short_name: string
  rationale: string
  variations: 1 | 2 | 3
  concept_verify: boolean
  formats: string[]
  naming_test_id: string
  naming_format: string
  naming_cta: string
  naming_angle: string
  static_variations: BriefVariationRow[]
  reference_image_urls: string
}

type CreativeBriefLike = {
  id: string
  trigger_type: string | null
  trigger_data: Record<string, unknown> | null
  status: string | null
  hypothesis: string | null
  target_audience: string | null
  hook: string | null
  format: string | null
  visual_direction: string | null
  copy_primary: string | null
  copy_headline: string | null
  copy_subtext: string | null
  cta: string | null
  campaign_short_name: string | null
  rationale: string | null
  success_criteria: Record<string, unknown> | null
  reference_image_urls: string[] | null
}

function clampVariations(n: number): 1 | 2 | 3 {
  if (n >= 3) return 3
  if (n === 2) return 2
  return 1
}

export function structuredEditorFromBrief(brief: CreativeBriefLike): StructuredBriefEditorState {
  const td = brief.trigger_data ?? {}
  const sc = brief.success_criteria ?? {}
  const naming = (td.naming ?? {}) as Record<string, unknown>
  const rawVars = Array.isArray(td.static_variations) ? td.static_variations : []
  const static_variations: BriefVariationRow[] = rawVars.map((item, i) => {
    const row = item as Record<string, unknown>
    return {
      variation_label: String(row.variation_label ?? ["A", "B", "C"][i] ?? "A"),
      headline: String(row.headline ?? ""),
      background_image_prompt: String(row.background_image_prompt ?? ""),
    }
  })

  const formatsFromSc = Array.isArray(sc.formats) ? sc.formats.map(String) : []
  const formatsFromBrief = (brief.format ?? "1x1,9x16").split(/[,/+\s]+/).filter(Boolean)

  return {
    id: brief.id,
    trigger_type: brief.trigger_type ?? "manual",
    status: brief.status ?? "briefed",
    hypothesis: brief.hypothesis ?? "",
    target_audience: brief.target_audience ?? "",
    hook: brief.hook ?? "",
    format: brief.format ?? "1x1,9x16",
    visual_direction: brief.visual_direction ?? "",
    copy_primary: brief.copy_primary ?? "",
    copy_headline: brief.copy_headline ?? "",
    copy_subtext: brief.copy_subtext ?? "",
    cta: brief.cta ?? "",
    campaign_short_name: brief.campaign_short_name ?? "",
    rationale: brief.rationale ?? "",
    variations: clampVariations(Number(sc.variations ?? td.variations ?? 1)),
    concept_verify: Boolean(sc.concept_verify ?? td.concept_verify),
    formats: formatsFromSc.length ? formatsFromSc : formatsFromBrief,
    naming_test_id: String(naming.test_id ?? "T05"),
    naming_format: String(naming.format ?? "Static_9x16"),
    naming_cta: String(naming.cta ?? "list_now"),
    naming_angle: String(naming.angle ?? td.angle ?? "pov_earnings"),
    static_variations,
    reference_image_urls: (brief.reference_image_urls ?? []).join("\n"),
  }
}

export function structuredEditorToPatch(state: StructuredBriefEditorState) {
  const effectiveVariations = state.concept_verify ? 1 : state.variations
  const trigger_data: Record<string, unknown> = {
    variations: effectiveVariations,
    concept_verify: state.concept_verify,
    angle: state.naming_angle,
    naming: {
      test_id: state.naming_test_id,
      format: state.naming_format,
      cta: state.naming_cta,
    },
  }
  if (state.static_variations.length) {
    trigger_data.static_variations = state.static_variations.slice(0, effectiveVariations)
  }

  return {
    trigger_type: state.trigger_type,
    status: state.status,
    hypothesis: state.hypothesis || null,
    target_audience: state.target_audience || null,
    hook: state.hook || null,
    format: state.formats.join(","),
    visual_direction: state.visual_direction || null,
    copy_primary: state.copy_primary || null,
    copy_headline: state.copy_headline || null,
    copy_subtext: state.copy_subtext || null,
    cta: state.cta || null,
    campaign_short_name: state.campaign_short_name || null,
    rationale: state.rationale || null,
    reference_image_urls: state.reference_image_urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean),
    trigger_data,
    success_criteria: {
      variations: effectiveVariations,
      concept_verify: state.concept_verify,
      formats: state.formats,
    },
  }
}

type Props = {
  state: StructuredBriefEditorState
  onChange: (state: StructuredBriefEditorState) => void
  onSave: () => void
  onCancel: () => void
  onGeneratePreview?: () => void
  busy?: boolean
  isVideo?: boolean
}

export function BriefEditorModal({
  state,
  onChange,
  onSave,
  onCancel,
  onGeneratePreview,
  busy,
  isVideo,
}: Props) {
  const namingPreview = useMemo(() => {
    try {
      return buildAdName({
        testId: state.naming_test_id,
        variant: "A",
        angle: state.naming_angle,
        format: state.naming_format.includes("Static")
          ? `Static_${state.formats[0] ?? "9x16"}`
          : state.naming_format,
        cta: state.naming_cta,
      })
    } catch {
      return "(invalid naming tokens)"
    }
  }, [state.naming_test_id, state.naming_angle, state.naming_format, state.naming_cta, state.formats])

  const set = <K extends keyof StructuredBriefEditorState>(key: K, value: StructuredBriefEditorState[K]) => {
    onChange({ ...state, [key]: value })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-background border shadow-xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Edit Creative Brief</h2>
          <p className="text-sm text-muted-foreground">Structured fields — naming preview updates live.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["hook", "Hook"],
              ["hypothesis", "Hypothesis"],
              ["target_audience", "Target Audience"],
              ["copy_headline", "Headline"],
              ["copy_subtext", "Subtext"],
              ["copy_primary", "Primary Copy"],
              ["cta", "CTA"],
              ["campaign_short_name", "Campaign Short Name"],
              ["visual_direction", "Visual Direction (Imagen prompt)"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="space-y-1 text-xs font-medium text-muted-foreground">
              {label}
              <textarea
                value={state[field]}
                onChange={(e) => set(field, e.target.value)}
                className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3 border-t pt-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Variations (1–3)
            <select
              value={state.variations}
              onChange={(e) => set("variations", clampVariations(Number(e.target.value)))}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              disabled={state.concept_verify}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm pb-1">
            <input
              type="checkbox"
              checked={state.concept_verify}
              onChange={(e) => set("concept_verify", e.target.checked)}
            />
            Concept verify (1 preview first)
          </label>
          {!isVideo ? (
            <div className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Formats</span>
              <div className="flex gap-3 pt-1">
                {(["1x1", "9x16"] as const).map((fmt) => (
                  <label key={fmt} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={state.formats.includes(fmt)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...state.formats, fmt])]
                          : state.formats.filter((f) => f !== fmt)
                        set("formats", next.length ? next : ["1x1"])
                      }}
                    />
                    {fmt}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 border-t pt-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Test ID
            <input
              value={state.naming_test_id}
              onChange={(e) => set("naming_test_id", e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Angle (snake_case)
            <input
              value={state.naming_angle}
              onChange={(e) => set("naming_angle", e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Format token
            <input
              value={state.naming_format}
              onChange={(e) => set("naming_format", e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            CTA token
            <input
              value={state.naming_cta}
              onChange={(e) => set("naming_cta", e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
            />
          </label>
        </div>
        <p className="text-xs font-mono bg-muted/50 rounded px-2 py-1.5">Preview: {namingPreview}</p>

        {state.static_variations.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Per-variant headlines</p>
            {state.static_variations.map((row, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[auto_1fr]">
                <span className="text-sm font-mono pt-2">{row.variation_label}</span>
                <input
                  value={row.headline}
                  onChange={(e) => {
                    const next = [...state.static_variations]
                    next[i] = { ...row, headline: e.target.value }
                    set("static_variations", next)
                  }}
                  className="rounded-md border px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 border rounded hover:bg-muted">
            Cancel
          </button>
          {!isVideo && onGeneratePreview ? (
            <button
              type="button"
              onClick={onGeneratePreview}
              disabled={busy}
              className="text-sm px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-50"
            >
              Generate 1 preview
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="text-sm px-3 py-1.5 bg-foreground text-background rounded disabled:opacity-50"
          >
            Save Brief
          </button>
        </div>
      </div>
    </div>
  )
}
