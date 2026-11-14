"use client"

import { useState } from "react"
import useSWR from "swr"

import { AdminSelect } from "@/components/admin/admin-select"

export type AssetLibraryEntry = {
  name: string
  filename: string
  gcsPath: string
  gcsUrl: string
  mediaType: "static" | "video" | "unknown"
  bucket: "main" | "creative"
  createdAt: string | null
  contentType: string | null
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed")
  return json as T
}

function normalizeObjectPath(path: string) {
  return path.replace(/^gs:\/\/[^/]+\//, "")
}

const MODEL_OPTIONS = [
  { value: "nano_banana", label: "Nano Banana (Gemini)", hint: "Strong photorealism; Google's current image model." },
  { value: "flux_2_pro", label: "FLUX.2 Pro (Replicate)", hint: "Top photorealism. Describe what you want rather than \"no X\"." },
  { value: "flux_schnell", label: "FLUX Schnell (Replicate)", hint: "Fast, cheap drafts to explore an idea." },
] as const

const ASPECTS = ["4:3", "1:1", "4:5", "3:4", "9:16", "16:9"] as const

type Props = {
  mediaType?: "static" | "video" | "all"
  selectedPath?: string
  onSelect: (entry: AssetLibraryEntry) => void
  /** Show the prompt → image generator (static libraries only). Default: on for static. */
  allowGenerate?: boolean
}

export function AssetLibraryPanel({ mediaType = "video", selectedPath, onSelect, allowGenerate }: Props) {
  const query = new URLSearchParams({ mediaType, limit: "50" })
  const { data, error, isLoading, mutate } = useSWR<{ assets: AssetLibraryEntry[] }>(
    `/api/admin/agent/creative-assets?${query}`,
    fetcher
  )

  const assets = (data?.assets ?? []).filter((a) => a.mediaType === mediaType || mediaType === "all")
  const normalizedSelected = selectedPath ? normalizeObjectPath(selectedPath) : ""
  const canGenerate = allowGenerate ?? mediaType === "static"

  const [showGenerator, setShowGenerator] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState<string>("nano_banana")
  const [aspect, setAspect] = useState<string>("4:3")
  const [count, setCount] = useState("2")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch("/api/admin/agent/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model, aspect_ratio: aspect, count: Number(count) }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        images?: Array<{ gcsPath: string; gcsUrl: string; filename: string }>
      }
      if (!res.ok) throw new Error(json.error ?? "Image generation failed")
      await mutate()
      const first = json.images?.[0]
      if (first) {
        onSelect({
          name: normalizeObjectPath(first.gcsPath),
          filename: first.filename,
          gcsPath: first.gcsPath,
          gcsUrl: first.gcsUrl,
          mediaType: "static",
          bucket: "creative",
          createdAt: new Date().toISOString(),
          contentType: "image/png",
        })
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Image generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const modelHint = MODEL_OPTIONS.find((m) => m.value === model)?.hint

  return (
    <div className="space-y-2">
      {canGenerate ? (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <button
            type="button"
            onClick={() => setShowGenerator((v) => !v)}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {showGenerator ? "▾" : "▸"} Generate an image from a prompt
          </button>
          {showGenerator ? (
            <div className="space-y-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Photorealistic photo of a small cedar outdoor sauna in a Seattle backyard…"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Model
                  <AdminSelect value={model} onValueChange={setModel} size="sm">
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </AdminSelect>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Aspect ratio
                  <AdminSelect value={aspect} onValueChange={setAspect} size="sm">
                    {ASPECTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </AdminSelect>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Images
                  <AdminSelect value={count} onValueChange={setCount} size="sm">
                    {["1", "2", "3", "4"].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </AdminSelect>
                </label>
              </div>
              {modelHint ? <p className="text-xs text-muted-foreground">{modelHint}</p> : null}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating || !prompt.trim()}
                  className="rounded-md bg-[#9A4A33] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {generating ? "Generating… (up to a minute)" : "Generate"}
                </button>
                <span className="text-xs text-muted-foreground">
                  Saved to the library; the first image is selected for this brief.
                </span>
              </div>
              {genError ? <p className="text-xs text-red-600">{genError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-64 overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset library</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading assets…</p>
        ) : error ? (
          <p className="text-xs text-red-500">{error instanceof Error ? error.message : "Could not load assets"}</p>
        ) : assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No assets yet. {canGenerate ? "Generate an image above, or upload one." : "Upload a video or generate statics first."}
          </p>
        ) : (
          <ul className="space-y-1">
            {assets.map((asset) => (
              <li key={asset.gcsPath}>
                <button
                  type="button"
                  onClick={() => onSelect(asset)}
                  className={`flex w-full items-center gap-2 text-left text-xs px-2 py-1.5 rounded border ${
                    normalizedSelected === normalizeObjectPath(asset.gcsPath)
                      ? "border-[#9A4A33] bg-[#9A4A33]/10"
                      : "border-transparent hover:bg-muted"
                  }`}
                  title={asset.gcsPath}
                >
                  {asset.mediaType === "static" && asset.gcsUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed GCS URLs, not optimizable
                    <img src={asset.gcsUrl} alt="" className="h-9 w-12 shrink-0 rounded object-cover" loading="lazy" />
                  ) : null}
                  <span className="min-w-0 truncate font-mono">{asset.filename}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{asset.mediaType}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
