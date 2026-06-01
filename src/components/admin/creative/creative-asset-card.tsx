"use client"

import { Check, Eye, Loader2, Wand2, X } from "lucide-react"

type CreativeAssetCardProps = {
  asset: {
    id: string
    generation_tool?: string | null
    variation_label?: string | null
    variation_index?: number | null
    status?: string | null
    performance_data?: Record<string, unknown> | null
  }
  sourceLabel: string
  preview: React.ReactNode
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  onApprove: () => void
  onReject: () => void
  onView: () => void
  approveBusy: boolean
  rejectBusy: boolean
  canEditPhoto: boolean
  editPrompt: string
  onEditPromptChange: (value: string) => void
  onApplyEdit: () => void
  editBusy: boolean
}

export function canEditPhotoAsset(asset: {
  asset_type?: string | null
  generation_tool?: string | null
  performance_data?: Record<string, unknown> | null
}) {
  if (asset.asset_type === "video") return false
  if (asset.generation_tool === "svg_template") return false
  if (asset.generation_tool === "composite-video") return false
  const perf = asset.performance_data
  if (!perf || typeof perf !== "object") return false
  const hasBase =
    typeof perf.base_gcs_path === "string" && perf.base_gcs_path.trim().length > 0
  const hasSource =
    typeof perf.source_image_url === "string" && perf.source_image_url.trim().length > 0
  return hasBase || hasSource
}

export function CreativeAssetCard({
  asset,
  sourceLabel,
  preview,
  selected,
  onSelectedChange,
  onApprove,
  onReject,
  onView,
  approveBusy,
  rejectBusy,
  canEditPhoto,
  editPrompt,
  onEditPromptChange,
  onApplyEdit,
  editBusy,
}: CreativeAssetCardProps) {
  const status = asset.status ?? "generated"
  const isApproved = status === "approved"

  return (
    <div className="rounded-md border bg-background p-2 space-y-2">
      {preview}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {sourceLabel} · {asset.variation_label ?? `Variation ${asset.variation_index ?? "—"}`} · {status}
        </span>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          aria-label="Select asset"
          className="size-3.5"
        />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onApprove}
          disabled={approveBusy || isApproved}
          aria-label="Approve"
          title={isApproved ? "Approved" : "Approve"}
          className="inline-flex size-8 items-center justify-center rounded-md border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40"
        >
          {approveBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={rejectBusy}
          aria-label="Reject"
          title="Reject"
          className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"
        >
          {rejectBusy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          onClick={onView}
          aria-label="View full"
          title="View full"
          className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted"
        >
          <Eye className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      {canEditPhoto ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-[#9A4A33]/30 bg-[#9A4A33]/5 p-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9A4A33]">Edit photo</p>
          <input
            value={editPrompt}
            onChange={(e) => onEditPromptChange(e.target.value)}
            placeholder="e.g. flip horizontal, remove blurred railing"
            className="w-full rounded border bg-background px-2 py-1.5 text-[11px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onApplyEdit()
              }
            }}
          />
          <button
            type="button"
            disabled={editBusy || !editPrompt.trim()}
            onClick={onApplyEdit}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#9A4A33] px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
          >
            {editBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            Apply edit
          </button>
        </div>
      ) : null}
    </div>
  )
}
