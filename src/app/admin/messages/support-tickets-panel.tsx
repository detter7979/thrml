"use client"

import { useEffect, useMemo, useState } from "react"

type SupportTicket = {
  id: string
  ticket_number: string | null
  subject: string | null
  message: string | null
  priority: string | null
  status: string | null
  name: string | null
  email: string | null
  booking_id: string | null
  user_id: string | null
  created_at: string | null
}

function formatTimestamp(value: string | null) {
  if (!value) return "Unknown time"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Unknown time"
  return parsed.toLocaleString()
}

function priorityClass(priority: string | null) {
  const key = (priority ?? "normal").toLowerCase()
  if (key === "urgent") return "border-rose-300 bg-rose-50 text-rose-700"
  if (key === "high") return "border-amber-300 bg-amber-50 text-amber-700"
  return "border-[#D9CBB8] bg-white text-[#5B4A3A]"
}

export function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/admin/support-tickets")
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          tickets?: SupportTicket[]
        }
        if (!response.ok) {
          if (!cancelled) setError(payload.error ?? "Failed to load support tickets.")
          return
        }
        const rows = payload.tickets ?? []
        if (!cancelled) {
          setTickets(rows)
          setSelectedTicketId((previous) => previous ?? rows[0]?.id ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load support tickets."
          setError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets]
  )

  if (loading && tickets.length === 0) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] text-sm text-[#7A6A5D]">
        Loading support tickets...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    )
  }

  return (
    <div className="grid min-h-[calc(100dvh-190px)] grid-cols-1 overflow-hidden rounded-2xl border border-[#D9CBB8] bg-[#F7F3EE] md:grid-cols-[360px_1fr]">
      <aside className="border-r border-[#E7DED3] bg-white">
        <header className="border-b border-[#E7DED3] px-4 py-3">
          <p className="font-medium text-[#2A2118]">Support queue</p>
          <p className="text-xs text-[#7A6A5D]">{tickets.length} ticket(s)</p>
        </header>
        <div className="max-h-[calc(100dvh-270px)] space-y-2 overflow-y-auto px-3 py-3">
          {tickets.length ? (
            tickets.map((ticket) => {
              const active = ticket.id === selectedTicketId
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-[#C75B3A] bg-[#FFF4EE]"
                      : "border-[#E7DED3] bg-[#FCF8F3] hover:border-[#D9CBB8]"
                  }`}
                >
                  <p className="text-sm font-medium text-[#2A2118]">
                    {ticket.ticket_number ?? "Ticket"} - {ticket.subject ?? "Support request"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#6E5B49]">{ticket.message ?? "No message body"}</p>
                  <p className="mt-2 text-[11px] text-[#8B7562]">{formatTimestamp(ticket.created_at)}</p>
                </button>
              )
            })
          ) : (
            <p className="px-1 text-sm text-[#7A6553]">No support tickets found.</p>
          )}
        </div>
      </aside>

      <main className="bg-[#F7F3EE]">
        {selectedTicket ? (
          <article className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl text-[#2A2118]">
                {selectedTicket.ticket_number ?? "Ticket"} - {selectedTicket.subject ?? "Support request"}
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityClass(selectedTicket.priority)}`}
              >
                {(selectedTicket.priority ?? "normal").toUpperCase()}
              </span>
              {selectedTicket.status ? (
                <span className="rounded-full border border-[#D9CBB8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#5B4A3A]">
                  {selectedTicket.status}
                </span>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#E5DCCF] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[#8B7562]">Requester</p>
              <p className="mt-1 text-sm text-[#2A2118]">
                {selectedTicket.name ?? "Unknown"} ({selectedTicket.email ?? "No email"})
              </p>
              <p className="mt-1 text-xs text-[#6E5B49]">
                Submitted: {formatTimestamp(selectedTicket.created_at)}
              </p>
              {selectedTicket.booking_id ? (
                <p className="mt-1 text-xs text-[#6E5B49]">Booking ID: {selectedTicket.booking_id}</p>
              ) : null}
              {selectedTicket.user_id ? (
                <p className="mt-1 text-xs text-[#6E5B49]">User ID: {selectedTicket.user_id}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#E5DCCF] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[#8B7562]">Message</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#2A2118]">
                {selectedTicket.message ?? "No message provided."}
              </p>
            </div>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#7A6A5D]">
            Select a ticket to review details.
          </div>
        )}
      </main>
    </div>
  )
}
