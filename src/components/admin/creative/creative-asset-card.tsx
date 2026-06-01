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

function IconAction({
  label,
  onClick,
  disabled,
  busy,
  tone = "neutral",
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  tone?: "approve" | "reject" | "neutral"
  children: React.ReactNode
}) {
  const toneClass =
    tone === "approve"
      ? "bg-green-600 text-white hover:bg-green-700 border-green-600"
      : tone === "reject"
        ? "bg-white/95 text-foreground hover:bg-white border-white/80"
        : "bg-white/95 text-foreground hover:bg-white border-white/80"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors disabled:opacity-40 ${toneClass}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  )
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
      <div className="relative overflow-hidden rounded-md">
        {preview}

        <label className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-md bg-black/45 backdrop-blur-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
            aria-label="Select asset"
            className="size-3.5 accent-[#9A4A33]"
          />
        </label>

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-end gap-1.5">
          <IconAction
            label={isApproved ? "Approved" : "Approve"}
            onClick={onApprove}
            disabled={isApproved}
            busy={approveBusy}
            tone="approve"
          >
            <Check className="size-4" strokeWidth={2.75} />
          </IconAction>
          <IconAction label="Reject" onClick={onReject} busy={rejectBusy} tone="reject">
            <X className="size-4" strokeWidth={2.75} />
          </IconAction>
          <IconAction label="View full" onClick={onView} tone="neutral">
            <Eye className="size-4" strokeWidth={2.75} />
          </IconAction>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[11px] text-muted-foreground">
          {sourceLabel} · {asset.variation_label ?? `Variation ${asset.variation_index ?? "—"}`} · {status}
        </span>
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
