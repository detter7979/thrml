"use client"

import { useCallback, useState } from "react"

import { createClient } from "@/lib/supabase/client"

export type InboxDraftRow = {
  id: string
  from_email: string
  subject: string | null
  category: string
  draft_reply: string | null
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type InboxDraftsPanelProps = {
  initialDrafts: InboxDraftRow[]
}

export function InboxDraftsPanel({ initialDrafts }: InboxDraftsPanelProps) {
  const [drafts, setDrafts] = useState<InboxDraftRow[]>(initialDrafts)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const sb = createClient()
      const { data } = await sb
        .from("inbox_drafts")
        .select("id, from_email, subject, category, draft_reply, created_at")
        .eq("approved", false)
        .is("sent_at", null)
        .order("created_at", { ascending: false })
        .limit(50)
      setDrafts((data ?? []) as InboxDraftRow[])
    } finally {
      setRefreshing(false)
    }
  }, [])

  const approveDraft = async (id: string) => {
    const sb = createClient()
    await sb
      .from("inbox_drafts")
      .update({ approved: true, approved_at: new Date().toISOString() })
      .eq("id", id)
    setDrafts((d) => d.filter((x) => x.id !== id))
  }

  return (
    <section className="space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5B4A3A]">
          Replies drafted by the inbox agent. Approve here to mark as ready to send (same data as the creative pipeline
          inbox tab).
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-md border border-[#DCCDBA] bg-[#FCF8F3] px-3 py-1.5 text-xs font-medium text-[#2A2118] hover:bg-[#F7EFE4] disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="text-sm text-[#6E5B49]">No pending inbox drafts.</p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li key={d.id} className="rounded-xl border border-[#DCCDBA] bg-[#FCF8F3] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#2A2118]">{d.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-[#6E5B49]">
                    {d.from_email} · {d.category} · {timeAgo(d.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void approveDraft(d.id)}
                  className="shrink-0 rounded-md bg-[#2A2118] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1F170F]"
                >
                  Approve
                </button>
              </div>
              {d.draft_reply ? (
                <div className="mt-3 rounded-lg border border-[#E7DACA] bg-[#F7EFE4] p-3">
                  <p className="mb-1 text-xs font-medium text-[#6E5B49]">Draft reply</p>
                  <p className="whitespace-pre-wrap text-sm text-[#2A2118]">{d.draft_reply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
