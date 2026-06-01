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
  active,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
        active
          ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : children}
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
      <div className="relative overflow-hidden rounded-md border bg-muted">
        {preview}

        <label className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded border border-white/20 bg-black/50 backdrop-blur-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
            aria-label="Select asset"
            className="size-3 accent-[#9A4A33]"
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <IconAction
          label={isApproved ? "Approved" : "Approve"}
          onClick={onApprove}
          disabled={isApproved}
          busy={approveBusy}
          active={!isApproved}
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </IconAction>
        <IconAction label="Reject" onClick={onReject} busy={rejectBusy}>
          <X className="size-3.5" strokeWidth={2.5} />
        </IconAction>
        <IconAction label="View full" onClick={onView}>
          <Eye className="size-3.5" strokeWidth={2.5} />
        </IconAction>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {sourceLabel} · {asset.variation_label ?? `Variation ${asset.variation_index ?? "—"}`} · {status}
      </p>

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
