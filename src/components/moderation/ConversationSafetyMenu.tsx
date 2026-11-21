"use client"

import { useState } from "react"
import { Ban, Flag, MoreHorizontal } from "lucide-react"

import { ReportDialog } from "@/components/moderation/ReportDialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  otherUserId: string
  otherFirstName: string
  conversationId: string
  blockedByMe: boolean
  onBlockedChange: (blockedByMe: boolean) => void
}

/** "⋯" menu in a conversation header: report or block the other person. */
export function ConversationSafetyMenu({
  otherUserId,
  otherFirstName,
  conversationId,
  blockedByMe,
  onBlockedChange,
}: Props) {
  const [reportOpen, setReportOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setBlocked(block: boolean) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/blocks", {
        method: block ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: otherUserId }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Something went wrong.")
      onBlockedChange(block)
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Safety options for ${otherFirstName}`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E5DDD6] text-[#5A4B40] transition-colors hover:bg-[#FAF6F1]"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReportOpen(true)} className="gap-2">
            <Flag className="size-4 text-[#8A7A6D]" />
            Report {otherFirstName}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => (blockedByMe ? void setBlocked(false) : setConfirmOpen(true))}
            className="gap-2 text-[#A8472B]"
          >
            <Ban className="size-4" />
            {blockedByMe ? `Unblock ${otherFirstName}` : `Block ${otherFirstName}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="user"
        targetId={otherUserId}
        conversationId={conversationId}
        targetName={otherFirstName}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-[#E7DED3] bg-[#FCFAF7] p-6">
          <div className="space-y-4">
            <DialogTitle className="font-serif text-2xl font-normal text-[#1A1410]">Block {otherFirstName}?</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#7A6355]">
              You won&apos;t be able to message each other. They won&apos;t be told. Booking details like access
              instructions still arrive for any session you already have. You can unblock anytime from this menu.
            </DialogDescription>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-11 flex-1 rounded-full border border-[#E7DED3] bg-white text-sm font-medium text-[#1A1410]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void setBlocked(true)}
                className="h-11 flex-1 rounded-full bg-[#1A1410] text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
