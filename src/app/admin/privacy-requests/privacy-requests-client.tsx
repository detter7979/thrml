"use client"

type PrivacyRequestRow = {
  id: string
  ticket_number: string | null
  name: string
  email: string
  subject: string
  message: string
  status: string | null
  priority: string | null
  created_at: string
  user_id: string | null
  resolution_source: string | null
  resolved_at: string | null
}

const RESPONSE_DEADLINE_DAYS = 30

function daysRemaining(createdAt: string): number {
  const created = new Date(createdAt).getTime()
  const deadline = created + RESPONSE_DEADLINE_DAYS * 24 * 60 * 60 * 1000
  return Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function PrivacyRequestsClient({
  initialRows,
  loadError,
}: {
  initialRows: PrivacyRequestRow[]
  loadError: string | null
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-[#2A2118]">Privacy requests</h1>
        <p className="mt-1 text-sm text-[#6E5B49]">
          Support tickets matching privacy, deletion, CCPA, or health data subjects. 30-day response clock from
          submission.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#E7DACA] bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7DACA] bg-[#FAF6F2] text-xs uppercase tracking-wide text-[#9A4A33]">
              <th className="px-4 py-3 font-medium">Ticket</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Requester</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Clock</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0E8E2]">
            {initialRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#6E5B49]">
                  No matching privacy requests.
                </td>
              </tr>
            ) : (
              initialRows.map((row) => {
                const daysLeft = daysRemaining(row.created_at)
                const overdue = daysLeft < 0 && !row.resolved_at
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 text-[#2A2118]">{row.ticket_number ?? row.id.slice(0, 8)}</td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium text-[#2A2118]">{row.subject}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#6E5B49]">{row.message}</p>
                    </td>
                    <td className="px-4 py-3 text-[#6E5B49]">
                      <p>{row.name}</p>
                      <p className="text-xs">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-[#6E5B49]">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      {row.resolved_at ? (
                        <span className="text-xs text-emerald-700">Resolved {formatDate(row.resolved_at)}</span>
                      ) : overdue ? (
                        <span className="text-xs font-medium text-red-600">{Math.abs(daysLeft)}d overdue</span>
                      ) : (
                        <span className="text-xs text-[#6E5B49]">{daysLeft}d remaining</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6E5B49]">{row.priority ?? "normal"}</td>
                    <td className="px-4 py-3 text-xs text-[#6E5B49]">{row.status ?? "open"}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
