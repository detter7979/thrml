"use client"

import { useState } from "react"

type Props = {
  onPurged: () => void
  onMessage: (msg: string) => void
  patchPipeline: (body: Record<string, unknown>) => Promise<unknown>
  busyAction: string | null
  setBusyAction: (v: string | null) => void
}

const CONFIRM_PHRASE = "DELETE_ALL_CREATIVES"

export function CreativePipelinePurgePanel({
  onPurged,
  onMessage,
  patchPipeline,
  busyAction,
  setBusyAction,
}: Props) {
  const [confirmText, setConfirmText] = useState("")
  const [open, setOpen] = useState(false)
  const busy = busyAction === "purge-creative-pipeline"

  const runPurge = async () => {
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      onMessage(`Type ${CONFIRM_PHRASE} to confirm.`)
      return
    }

    setBusyAction("purge-creative-pipeline")
    try {
      const json = (await patchPipeline({
        action: "purge_creative_pipeline",
        confirm: confirmText.trim(),
      })) as {
        summary?: {
          briefsDeleted?: number
          assetsDeleted?: number
          gcsDeleted?: number
          gcsSkippedPreserved?: number
        }
      }

      const summary = json.summary
      onMessage(
        summary
          ? `Purged ${summary.briefsDeleted ?? 0} briefs, ${summary.assetsDeleted ?? 0} assets, ${summary.gcsDeleted ?? 0} GCS files. Paths with "base" in the name kept (${summary.gcsSkippedPreserved ?? 0} skipped).`
          : "Creative pipeline purged."
      )
      setConfirmText("")
      setOpen(false)
      onPurged()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Purge failed.")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-800">Reset creative pipeline</h2>
          <p className="text-xs text-red-900/80 mt-1 max-w-2xl leading-relaxed">
            Deletes every creative brief, asset row, render job, and generated GCS files under{" "}
            <code className="font-mono">Static/composite/</code>, <code className="font-mono">Video/composite/</code>,
            legacy flat composites, <code className="font-mono">renders/</code>, and{" "}
            <code className="font-mono">namer/exports/</code>. Keeps anything under{" "}
            <code className="font-mono">Static/base/</code>, <code className="font-mono">Video/base/</code>, legacy{" "}
            <code className="font-mono">bases/</code>, and any path with &quot;base&quot; in the name.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md border border-red-300 bg-white hover:bg-red-50 text-red-900"
        >
          {open ? "Cancel" : "Purge all…"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-lg border border-red-200 bg-white p-3">
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>Removes all rows from creative_briefs and creative_assets</li>
            <li>Deletes GCS files under Static/, composited Video/ renders, and legacy renders/</li>
            <li>Skips any path with &quot;base&quot; in the name (POV uploads, pre-overlay photos, bases/ folder)</li>
          </ul>
          <label className="block space-y-1 text-xs font-medium text-red-900">
            Type {CONFIRM_PHRASE} to confirm
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="w-full rounded-md border border-red-200 bg-background px-3 py-2 font-mono text-xs"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            disabled={busy || confirmText.trim() !== CONFIRM_PHRASE}
            onClick={() => void runPurge()}
            className="text-xs bg-red-600 text-white rounded px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? "Purging…" : "Delete all briefs & generated creatives"}
          </button>
        </div>
      ) : null}
    </section>
  )
}
