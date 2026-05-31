"use client"

import { useRef, useState } from "react"
import useSWR from "swr"

import { AssetLibraryPanel, type AssetLibraryEntry } from "./asset-library-panel"
import type { VideoConfig, VideoCopyVariant } from "@/lib/agent/types"
import {
  DEFAULT_POV_SAUNA_TEMPLATE_VERSION,
  DEFAULT_POV_VIDEO_OVERLAY,
} from "@/lib/agent/video-template-copy"
import { DEFAULT_HOST_HEADLINE, isSplitHeaderSvgTemplate } from "@/lib/agent/svg-template-shared"
import {
  normalizeGcsObjectPath,
  suggestedT4BaseVideoObjectPath,
  T4_BASE_VIDEO_UPLOAD,
} from "@/lib/agent/t4-base-video-upload"

export type CreativeTemplateSummary = {
  id: string
  label: string
  short_label: string
  description: string | null
  group: "static_photo" | "static_svg" | "video_pov" | null
  recommended: boolean
  type: "static" | "video"
  formats: string[]
  concept_verify_default: boolean
  full_batch_variations: number
  generation_tool?: string | null
  svg_template_id?: string | null
}

const TEMPLATE_GROUP_ORDER = ["static_photo", "static_svg", "video_pov"] as const

const TEMPLATE_GROUP_LABELS: Record<(typeof TEMPLATE_GROUP_ORDER)[number], string> = {
  static_photo: "Static · Photo + overlay",
  static_svg: "Static · SVG layouts",
  video_pov: "Video · POV overlay",
}

function templatesByGroup(templates: CreativeTemplateSummary[]) {
  const grouped = new Map<string, CreativeTemplateSummary[]>()
  for (const group of TEMPLATE_GROUP_ORDER) grouped.set(group, [])
  for (const template of templates) {
    const key = template.group ?? "static_photo"
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(template)
  }
  return TEMPLATE_GROUP_ORDER.map((group) => ({
    group,
    label: TEMPLATE_GROUP_LABELS[group],
    templates: grouped.get(group) ?? [],
  })).filter((section) => section.templates.length > 0)
}

function formatTemplateFormats(formats: string[]) {
  return formats.map((f) => f.replace("x", ":")).join(", ")
}

export type SvgTemplateSummary = {
  id: string
  label: string
  tokens: string[]
  aspect_ratios: string[]
}

const SPLIT_HEADER_TOKENS = ["TAGLINE_EYEBROW", "HEADLINE", "SUBHEAD"] as const

type CreativeStorageInfo = {
  mainBucket: string
  creativeBucket: string
  suggestedObjectPath: string
  suggestedGsUri: string
  gsutilCommand: string
  legacyBaseExample: string
  canonicalPrefix: string
}

function VideoUploadButton({
  onFile,
  disabled,
  busy,
  label = "Choose video file",
}: {
  onFile: (file: File) => void
  disabled?: boolean
  busy?: boolean
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ""
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="text-xs px-3 py-1.5 rounded-md border bg-background hover:bg-muted disabled:opacity-50"
      >
        {busy ? "Uploading…" : label}
      </button>
    </div>
  )
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed")
  return json as T
}

type Props = {
  onCreated: () => void
  onMessage: (msg: string) => void
  busyAction: string | null
  setBusyAction: (v: string | null) => void
  patchPipeline: (body: Record<string, unknown>) => Promise<unknown>
}

export function BriefIntakePanel({
  onCreated,
  onMessage,
  busyAction,
  setBusyAction,
  patchPipeline,
}: Props) {
  const { data } = useSWR<{ templates: CreativeTemplateSummary[]; svgTemplates?: SvgTemplateSummary[] }>(
    "/api/admin/agent/creative-templates",
    fetcher
  )
  const templates = data?.templates ?? []
  const svgTemplates = data?.svgTemplates ?? []

  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [conceptVerify, setConceptVerify] = useState(true)
  const [showManual, setShowManual] = useState(false)
  const [uploadedGcsPath, setUploadedGcsPath] = useState("")

  const [videoDraft, setVideoDraft] = useState({
    conceptSlug: "",
    assetSlug: "",
    source: "uploaded" as VideoConfig["source"],
    runwayPrompt: "",
    templateVersion: DEFAULT_POV_SAUNA_TEMPLATE_VERSION,
    duration: 5 as 5 | 10,
    ratio: "768:1280" as "768:1280" | "1280:768",
    copyVariants: [{ slug: "pov-idle-income", copy: DEFAULT_POV_VIDEO_OVERLAY }] as VideoCopyVariant[],
    hypothesis: "",
  })

  const [staticDraft, setStaticDraft] = useState({
    hook: "",
    headline: "",
    visual_direction: "",
    hypothesis: "",
    campaign_short_name: "pov-earnings",
  })

  const [staticMode, setStaticMode] = useState<"imagen" | "svg">("imagen")
  const [svgTemplateId, setSvgTemplateId] = useState("")
  const [svgAspectRatio, setSvgAspectRatio] = useState<"1:1" | "4:5" | "9:16">("1:1")
  const [photoGcsPath, setPhotoGcsPath] = useState("")
  const [svgTokens, setSvgTokens] = useState<Record<string, string>>({
    TAGLINE_EYEBROW: "PRIVATE WELLNESS, BY THE HOUR.",
    HEADLINE: DEFAULT_HOST_HEADLINE,
    SUBHEAD: "Backyard and cabin saunas in Seattle + LA.",
  })

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
  const selectedSvgTemplate = svgTemplates.find((t) => t.id === svgTemplateId)
  const templateSections = templatesByGroup(templates)
  const activeSvgTokenKeys = isSplitHeaderSvgTemplate(svgTemplateId)
    ? SPLIT_HEADER_TOKENS
    : (selectedSvgTemplate?.tokens ?? []).filter((token) => token !== "PHOTO_URL")

  const onPhotoLibrarySelect = (entry: AssetLibraryEntry) => {
    setPhotoGcsPath(normalizeGcsObjectPath(entry.gcsPath))
  }

  const needsUploadedBaseVideo =
    selectedTemplate?.type === "video" && selectedTemplate.id === "T4"
  const needsRunwayApiKey =
    selectedTemplate?.type === "video" && selectedTemplate.id === "T2"

  const { data: storageInfo } = useSWR<CreativeStorageInfo>(
    needsUploadedBaseVideo ? "/api/admin/agent/creative-storage-info" : null,
    fetcher,
  )
  const t4ObjectPath = storageInfo?.suggestedObjectPath ?? suggestedT4BaseVideoObjectPath()
  const t4GsutilCommand = storageInfo?.gsutilCommand ?? ""
  const t4CreativeBucket = storageInfo?.creativeBucket ?? "your-creative-bucket"
  const t4LegacyExample = storageInfo?.legacyBaseExample ?? "bases/YYYY/MM/pov-earnings/sauna_v1.mp4"

  const createFromTemplate = async (saveAndApprove: boolean) => {
    if (!selectedTemplateId) {
      onMessage("Select a template first.")
      return
    }
    if (needsUploadedBaseVideo && !uploadedGcsPath.trim()) {
      onMessage("Select or upload a POV sauna base video before creating a T4 brief.")
      return
    }
    setBusyAction("create-from-template")
    try {
      const res = await fetch("/api/admin/agent/creative-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          conceptVerify,
          uploadedGcsPath: normalizeGcsObjectPath(uploadedGcsPath.trim()) || undefined,
          saveAndApprove,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Template brief failed")
      onCreated()
      onMessage(saveAndApprove ? "Brief created from template and approved." : "Brief created from template.")
      setSelectedTemplateId("")
      setUploadedGcsPath("")
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not create from template.")
    } finally {
      setBusyAction(null)
    }
  }

  const buildVideoConfig = (): VideoConfig => ({
    source: videoDraft.source,
    runwayPrompt: videoDraft.source === "runway" ? videoDraft.runwayPrompt.trim() : undefined,
    uploadedGcsPath: videoDraft.source === "uploaded" ? uploadedGcsPath.trim() : undefined,
    copyVariants: videoDraft.copyVariants.filter((v) => v.slug.trim() && v.copy.trim()),
    templateVersion: videoDraft.templateVersion,
    conceptSlug: videoDraft.conceptSlug.trim(),
    assetSlug: videoDraft.assetSlug.trim(),
    duration: videoDraft.duration,
    ratio: videoDraft.ratio,
  })

  const createVideoBrief = async (saveAndApprove: boolean) => {
    setBusyAction(saveAndApprove ? "create-video-approve" : "create-video-draft")
    try {
      const video_config = buildVideoConfig()
      if (!video_config.conceptSlug || !video_config.assetSlug) throw new Error("Concept and asset slug required.")
      if (!video_config.copyVariants.length) throw new Error("Add at least one copy variant.")
      await patchPipeline({
        action: "create_video_brief",
        brief: {
          video_config,
          hook: video_config.copyVariants[0]?.copy,
          hypothesis: videoDraft.hypothesis.trim() || null,
          saveAndApprove,
        },
      })
      onCreated()
      onMessage(saveAndApprove ? "Video brief created and approved." : "Video brief saved.")
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not create video brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const createStaticBrief = async (saveAndApprove: boolean) => {
    setBusyAction(saveAndApprove ? "create-static-approve" : "create-static-draft")
    try {
      if (!staticDraft.visual_direction.trim()) throw new Error("Visual direction is required.")
      await patchPipeline({
        action: "create_static_brief",
        brief: {
          hook: staticDraft.hook.trim() || staticDraft.headline.trim(),
          hypothesis: staticDraft.hypothesis.trim() || null,
          copy_headline: staticDraft.headline.trim() || null,
          visual_direction: staticDraft.visual_direction.trim(),
          campaign_short_name: staticDraft.campaign_short_name.trim(),
          format: "1x1,9x16",
          trigger_data: {
            category: "Hosts",
            angle: "pov_earnings",
            concept_verify: conceptVerify,
            variations: conceptVerify ? 1 : 3,
            naming: { test_id: "T05", format: "Static_9x16", cta: "list_now" },
          },
          success_criteria: {
            variations: conceptVerify ? 1 : 3,
            concept_verify: conceptVerify,
            formats: ["1x1", "9x16"],
          },
          saveAndApprove,
        },
      })
      onCreated()
      onMessage(saveAndApprove ? "Static brief created and approved." : "Static brief saved.")
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not create static brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const createSvgStaticBrief = async () => {
    setBusyAction("create-svg-static")
    try {
      if (!svgTemplateId) throw new Error("Select an SVG template.")

      const tokens = Object.fromEntries(
        activeSvgTokenKeys.map((key) => [key, svgTokens[key]?.trim() ?? ""]).filter(([, value]) => value),
      )

      const json = (await patchPipeline({
        action: "create_svg_static_brief",
        brief: {
          svg_template_id: svgTemplateId,
          aspect_ratio: svgAspectRatio,
          tokens,
          photo_gcs_path: photoGcsPath.trim() || undefined,
          campaign_short_name: staticDraft.campaign_short_name.trim() || "pov-earnings",
          hypothesis: staticDraft.hypothesis.trim() || null,
          hook: svgTokens.POV_LINE_1?.trim() || svgTokens.HEADLINE?.trim() || null,
          concept_verify: true,
          generate_preview: true,
          saveAndApprove: false,
        },
      })) as { asset?: { conventionName?: string | null; gcsPath?: string } }

      onCreated()
      const convention = json.asset?.conventionName
      onMessage(
        convention
          ? `SVG preview generated (${convention}).`
          : "SVG preview generated and linked to new brief.",
      )
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not generate SVG static.")
    } finally {
      setBusyAction(null)
    }
  }

  const uploadBaseVideoFile = async (
    file: File,
    opts?: { conceptSlug?: string; assetSlug?: string; category?: string; angleSlug?: string },
  ) => {
    const conceptSlug = opts?.conceptSlug ?? videoDraft.conceptSlug.trim()
    const assetSlug = opts?.assetSlug ?? videoDraft.assetSlug.trim()
    if (!conceptSlug || !assetSlug) {
      throw new Error("Enter concept slug and asset slug before uploading.")
    }

    const form = new FormData()
    form.set("file", file)
    form.set("conceptSlug", conceptSlug)
    form.set("assetSlug", assetSlug)
    form.set("category", opts?.category ?? "Hosts")
    form.set("angleSlug", opts?.angleSlug ?? conceptSlug.replace(/-/g, "_"))

    let res: Response
    try {
      res = await fetch("/api/admin/agent/upload-base-video", { method: "POST", body: form })
    } catch {
      throw new Error("Upload request failed — check your connection and try again.")
    }

    const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; gcsPath?: string }
    if (!res.ok) {
      const detail = json.detail ? `: ${json.detail}` : ""
      throw new Error(`${json.error ?? "Upload failed"}${detail}`)
    }
    if (!json.gcsPath) throw new Error("Upload succeeded but storage path was missing.")
    setUploadedGcsPath(normalizeGcsObjectPath(json.gcsPath))
  }

  const onLibrarySelect = (entry: AssetLibraryEntry) => {
    setUploadedGcsPath(normalizeGcsObjectPath(entry.gcsPath))
  }

  const uploadT4BaseVideo = async (file: File) => {
    setBusyAction("upload-base-video")
    try {
      await uploadBaseVideoFile(file, T4_BASE_VIDEO_UPLOAD)
      onMessage("Sauna base video uploaded — you can create the T4 brief now.")
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Brief</h2>
          <p className="text-xs text-muted-foreground mt-1">Start from a template or create manually.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs px-3 py-1.5 border rounded hover:bg-muted"
        >
          {showManual ? "Hide manual" : "Manual form"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Template
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value)
              const t = templates.find((x) => x.id === e.target.value)
              if (t) setConceptVerify(t.concept_verify_default)
              if (e.target.value === "T2" || e.target.value === "T4") {
                setVideoDraft((p) => ({
                  ...p,
                  templateVersion: DEFAULT_POV_SAUNA_TEMPLATE_VERSION,
                  source: e.target.value === "T4" ? "uploaded" : "runway",
                }))
              }
            }}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Choose a creative template…</option>
            {templateSections.map((section) => (
              <optgroup key={section.group} label={section.label}>
                {section.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.short_label}
                    {t.recommended ? " ★" : ""}
                    {" — "}
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={conceptVerify} onChange={(e) => setConceptVerify(e.target.checked)} />
          Concept verify
        </label>
      </div>

      {selectedTemplate ? (
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#9A4A33]">
              {selectedTemplate.id}
            </span>
            <span className="text-xs rounded-full border bg-background px-2 py-0.5 text-muted-foreground">
              {selectedTemplate.type === "video" ? "Video" : "Static"}
            </span>
            {selectedTemplate.recommended ? (
              <span className="text-xs rounded-full bg-[#9A4A33]/10 px-2 py-0.5 text-[#9A4A33]">
                Recommended
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatTemplateFormats(selectedTemplate.formats)}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{selectedTemplate.label}</p>
          {selectedTemplate.description ? (
            <p className="text-xs text-muted-foreground leading-relaxed">{selectedTemplate.description}</p>
          ) : null}
        </div>
      ) : null}

      {needsRunwayApiKey ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          T2 calls Runway to generate base video and requires <code className="font-mono">RUNWAY_API_KEY</code> on
          the server. To overlay copy on your own POV sauna MP4, use{" "}
          <strong>T4 · POV Sauna (Upload)</strong> instead.
        </p>
      ) : null}

      {needsUploadedBaseVideo ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            T4 needs a POV sauna base MP4 in the creative GCS bucket. Upload via gsutil (below), pick from the
            library, paste a path, or try the in-app uploader. After approval, the Railway worker composites the
            same centered POV overlay as T2 (template v{DEFAULT_POV_SAUNA_TEMPLATE_VERSION}).
          </p>

          <details className="rounded-md border bg-background px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">
              Upload directly to GCS (recommended)
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <p>
                Your creative bucket is <code className="font-mono text-foreground">{t4CreativeBucket}</code>{" "}
                (from env). Statics use{" "}
                <code className="font-mono text-foreground">{storageInfo?.mainBucket ?? "GCS_BUCKET_NAME"}</code>.
                Older test uploads are often under legacy{" "}
                <code className="font-mono">{t4LegacyExample}</code> — paste any existing object path below.
              </p>
              <p>
                <strong>New canonical folder</strong> (use for all new POV sauna bases):
              </p>
              <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] text-foreground">
                {t4GsutilCommand || `gsutil cp your-sauna.mp4 gs://${t4CreativeBucket}/${t4ObjectPath}`}
              </pre>
              <p>
                List everything:{" "}
                <code className="font-mono">gsutil ls -r gs://{t4CreativeBucket}/**/*.mp4</code>
              </p>
            </div>
          </details>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            GCS object path
            <input
              value={uploadedGcsPath}
              onChange={(e) => setUploadedGcsPath(normalizeGcsObjectPath(e.target.value))}
              placeholder={t4ObjectPath}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <button
            type="button"
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => setUploadedGcsPath(t4ObjectPath)}
          >
            Use suggested path for this month
          </button>

          <VideoUploadButton
            busy={busyAction === "upload-base-video"}
            disabled={busyAction !== null && busyAction !== "upload-base-video"}
            label="Try in-app upload"
            onFile={(file) => void uploadT4BaseVideo(file)}
          />

          <AssetLibraryPanel
            mediaType="video"
            selectedPath={uploadedGcsPath}
            onSelect={onLibrarySelect}
          />
          <p className="text-xs text-muted-foreground">
            Library searches both buckets. Hover a row to see the full path — paste that path above if select does not
            stick.
          </p>
          {uploadedGcsPath ? (
            <p className="text-xs font-mono text-green-700 truncate">Selected: {uploadedGcsPath}</p>
          ) : (
            <p className="text-xs text-amber-700">Base video path required</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selectedTemplateId || busyAction !== null || (needsUploadedBaseVideo && !uploadedGcsPath.trim())}
          onClick={() => void createFromTemplate(false)}
          className="text-xs border rounded px-3 py-1.5 disabled:opacity-50"
        >
          Create draft
        </button>
        <button
          type="button"
          disabled={!selectedTemplateId || busyAction !== null || (needsUploadedBaseVideo && !uploadedGcsPath.trim())}
          onClick={() => void createFromTemplate(true)}
          className="text-xs bg-green-600 text-white rounded px-3 py-1.5 disabled:opacity-50"
        >
          Create &amp; approve
        </button>
      </div>

      {showManual ? (
        <div className="border-t pt-4 space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="font-medium text-muted-foreground">Manual type:</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="manualType"
                checked={!videoDraft.conceptSlug && staticDraft.hook !== "__video__"}
                onChange={() => setStaticDraft((p) => ({ ...p, hook: p.hook === "__video__" ? "" : p.hook }))}
              />
              Static
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Static brief</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="staticMode"
                  checked={staticMode === "imagen"}
                  onChange={() => setStaticMode("imagen")}
                />
                Imagen / Replicate
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="staticMode"
                  checked={staticMode === "svg"}
                  onChange={() => setStaticMode("svg")}
                />
                SVG template
              </label>
            </div>

            {staticMode === "svg" ? (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Template
                    <select
                      value={svgTemplateId}
                      onChange={(e) => setSvgTemplateId(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Select SVG template…</option>
                      {svgTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Aspect ratio
                    <select
                      value={svgAspectRatio}
                      onChange={(e) =>
                        setSvgAspectRatio(e.target.value as "1:1" | "4:5" | "9:16")
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                    >
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </label>
                </div>

                {activeSvgTokenKeys.map((key) => (
                  <input
                    key={key}
                    placeholder={key.replaceAll("_", " ")}
                    value={svgTokens[key] ?? ""}
                    onChange={(e) => setSvgTokens((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                ))}

                {isSplitHeaderSvgTemplate(svgTemplateId) ? (
                  <>
                    <AssetLibraryPanel
                      mediaType="static"
                      selectedPath={photoGcsPath}
                      onSelect={onPhotoLibrarySelect}
                    />
                    {photoGcsPath ? (
                      <p className="text-xs font-mono text-green-700 truncate">{photoGcsPath}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Optional photo override — defaults to bundled hero sauna image.
                      </p>
                    )}
                  </>
                ) : null}

                <button
                  type="button"
                  disabled={!svgTemplateId || busyAction !== null}
                  onClick={() => void createSvgStaticBrief()}
                  className="text-xs bg-[#9A4A33] text-white rounded px-3 py-1.5 disabled:opacity-50"
                >
                  Generate preview asset
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    placeholder="Headline"
                    value={staticDraft.headline}
                    onChange={(e) => setStaticDraft((p) => ({ ...p, headline: e.target.value }))}
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Campaign short name"
                    value={staticDraft.campaign_short_name}
                    onChange={(e) =>
                      setStaticDraft((p) => ({ ...p, campaign_short_name: e.target.value }))
                    }
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  placeholder="Visual direction (Imagen prompt)"
                  value={staticDraft.visual_direction}
                  onChange={(e) => setStaticDraft((p) => ({ ...p, visual_direction: e.target.value }))}
                  className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void createStaticBrief(false)}
                    className="text-xs border rounded px-3 py-1.5"
                  >
                    Save static draft
                  </button>
                  <button
                    type="button"
                    onClick={() => void createStaticBrief(true)}
                    className="text-xs bg-green-600 text-white rounded px-3 py-1.5"
                  >
                    Save static &amp; approve
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Video brief</p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                placeholder="Concept slug"
                value={videoDraft.conceptSlug}
                onChange={(e) => setVideoDraft((p) => ({ ...p, conceptSlug: e.target.value }))}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <input
                placeholder="Asset slug"
                value={videoDraft.assetSlug}
                onChange={(e) => setVideoDraft((p) => ({ ...p, assetSlug: e.target.value }))}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={videoDraft.source === "runway"}
                  onChange={() => setVideoDraft((p) => ({ ...p, source: "runway" }))}
                />
                Runway
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={videoDraft.source === "uploaded"}
                  onChange={() => setVideoDraft((p) => ({ ...p, source: "uploaded" }))}
                />
                Upload / library
              </label>
            </div>
            {videoDraft.source === "runway" ? (
              <textarea
                value={videoDraft.runwayPrompt}
                onChange={(e) => setVideoDraft((p) => ({ ...p, runwayPrompt: e.target.value }))}
                className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
              />
            ) : (
              <>
                <VideoUploadButton
                  busy={busyAction === "upload-base-video"}
                  disabled={busyAction !== null && busyAction !== "upload-base-video"}
                  onFile={(file) => {
                    setBusyAction("upload-base-video")
                    void uploadBaseVideoFile(file)
                      .then(() => onMessage("Base video uploaded."))
                      .catch((err) => onMessage(err instanceof Error ? err.message : "Upload failed"))
                      .finally(() => setBusyAction(null))
                  }}
                />
                <AssetLibraryPanel mediaType="video" selectedPath={uploadedGcsPath} onSelect={onLibrarySelect} />
                {uploadedGcsPath ? <p className="text-xs font-mono text-green-700">{uploadedGcsPath}</p> : null}
              </>
            )}
            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <label className="space-y-1 text-xs">
                Template v
                <input
                  type="number"
                  min={1}
                  value={videoDraft.templateVersion}
                  onChange={(e) =>
                    setVideoDraft((p) => ({ ...p, templateVersion: Number(e.target.value) || 1 }))
                  }
                  className="w-full rounded border px-2 py-1"
                />
              </label>
              <label className="space-y-1 text-xs">
                Duration (Runway)
                <select
                  value={videoDraft.duration}
                  onChange={(e) =>
                    setVideoDraft((p) => ({ ...p, duration: Number(e.target.value) as 5 | 10 }))
                  }
                  className="w-full rounded border px-2 py-1"
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                Ratio
                <select
                  value={videoDraft.ratio}
                  onChange={(e) =>
                    setVideoDraft((p) => ({
                      ...p,
                      ratio: e.target.value as "768:1280" | "1280:768",
                    }))
                  }
                  className="w-full rounded border px-2 py-1"
                >
                  <option value="768:1280">9:16 vertical</option>
                  <option value="1280:768">16:9 horizontal</option>
                </select>
              </label>
            </div>
            {videoDraft.copyVariants.map((variant, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <input
                  value={variant.slug}
                  placeholder="slug"
                  onChange={(e) =>
                    setVideoDraft((p) => ({
                      ...p,
                      copyVariants: p.copyVariants.map((v, i) =>
                        i === index ? { ...v, slug: e.target.value } : v
                      ),
                    }))
                  }
                  className="rounded-md border px-2 py-1 text-sm"
                />
                <input
                  value={variant.copy}
                  placeholder="overlay copy"
                  onChange={(e) =>
                    setVideoDraft((p) => ({
                      ...p,
                      copyVariants: p.copyVariants.map((v, i) =>
                        i === index ? { ...v, copy: e.target.value } : v
                      ),
                    }))
                  }
                  className="rounded-md border px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVideoDraft((p) => ({
                      ...p,
                      copyVariants: p.copyVariants.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-xs border rounded px-2"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setVideoDraft((p) => ({
                  ...p,
                  copyVariants: [...p.copyVariants, { slug: "", copy: "" }],
                }))
              }
              className="text-xs border rounded px-2 py-1"
            >
              + variant
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void createVideoBrief(false)}
                className="text-xs border rounded px-3 py-1.5"
              >
                Save video draft
              </button>
              <button
                type="button"
                onClick={() => void createVideoBrief(true)}
                className="text-xs bg-green-600 text-white rounded px-3 py-1.5"
              >
                Save video &amp; approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
