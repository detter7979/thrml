"use client"

import useSWR from "swr"

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

type Props = {
  mediaType?: "static" | "video" | "all"
  selectedPath?: string
  onSelect: (entry: AssetLibraryEntry) => void
}

export function AssetLibraryPanel({ mediaType = "video", selectedPath, onSelect }: Props) {
  const query = new URLSearchParams({ mediaType, limit: "50" })
  const { data, error, isLoading } = useSWR<{ assets: AssetLibraryEntry[] }>(
    `/api/admin/agent/creative-assets?${query}`,
    fetcher
  )

  const assets = (data?.assets ?? []).filter((a) => a.mediaType === mediaType || mediaType === "all")

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-48 overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset library</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading assets…</p>
      ) : error ? (
        <p className="text-xs text-red-500">{error instanceof Error ? error.message : "Could not load assets"}</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No assets found. Upload a video or generate statics first.</p>
      ) : (
        <ul className="space-y-1">
          {assets.map((asset) => (
            <li key={asset.gcsPath}>
              <button
                type="button"
                onClick={() => onSelect(asset)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded border truncate ${
                  selectedPath === asset.gcsPath
                    ? "border-[#9A4A33] bg-[#9A4A33]/10"
                    : "border-transparent hover:bg-muted"
                }`}
                title={asset.gcsPath}
              >
                <span className="font-mono">{asset.filename}</span>
                <span className="text-muted-foreground ml-2">{asset.mediaType}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
