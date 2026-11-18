"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  AVAILABILITY_LABEL,
  OWNS_SAUNA_LABEL,
  PRIVATE_ACCESS_LABEL,
  type ApplicationStatus,
  type OwnsSauna,
} from "@/lib/host/host-applications"

export type HostApplicationRow = {
  id: string
  created_at: string
  email: string
  full_name: string | null
  phone: string | null
  owns_sauna: OwnsSauna
  neighborhood: string | null
  sauna_type: string | null
  private_access: string | null
  availability: string | null
  notes: string | null
  status: ApplicationStatus
  admin_note: string | null
  utm_source: string | null
  utm_campaign: string | null
  user_id: string | null
}

const OWNER_STATUSES: ApplicationStatus[] = ["new", "shortlisted", "founding", "waitlisted", "declined", "converted"]

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  new: "bg-sky-100 text-sky-800",
  shortlisted: "bg-amber-100 text-amber-800",
  founding: "bg-emerald-100 text-emerald-800",
  waitlisted: "bg-zinc-200 text-zinc-700",
  declined: "bg-rose-100 text-rose-700",
  converted: "bg-emerald-50 text-emerald-700",
  future: "bg-violet-100 text-violet-800",
}

const INVITE_URL = "https://usethrml.com/become-a-host?start=1"

function fmt(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString()
}

export function HostApplicationsClient({
  rows,
  foundingCap,
  foundingSpotsLeft,
}: {
  rows: HostApplicationRow[]
  foundingCap: number
  foundingSpotsLeft: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<"owners" | "future">("owners")
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const owners = rows.filter((r) => r.owns_sauna === "yes")
  const future = rows.filter((r) => r.owns_sauna !== "yes")
  const visible = useMemo(() => {
    const base = tab === "owners" ? owners : future
    return statusFilter === "all" || tab === "future" ? base : base.filter((r) => r.status === statusFilter)
  }, [tab, statusFilter, owners, future])

  async function update(id: string, body: { status?: ApplicationStatus; admin_note?: string }) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/host-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(payload.error ?? "Couldn't update the application.")
        return
      }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(INVITE_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(`Copy failed. The invite link is ${INVITE_URL}`)
    }
  }

  const counts = OWNER_STATUSES.map((s) => [s, owners.filter((r) => r.status === s).length] as const)

  return (
    <div className="space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#2A2118]">Host applications</h1>
          <p className="mt-1 text-sm text-[#6E5B49]">
            {foundingSpotsLeft} of {foundingCap} founding spots open. Founding status is granted when you approve a
            listing with &ldquo;Approve as founding&rdquo; in Listings.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-[#CDBCA8] bg-[#FCF8F3] text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
          onClick={() => void copyInvite()}
        >
          {copied ? "Copied!" : "Copy host invite link"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button
          size="sm"
          className={tab === "owners" ? "bg-[#2A2118] text-white" : "border border-[#CDBCA8] bg-[#FCF8F3] text-[#2A2118]"}
          onClick={() => setTab("owners")}
        >
          Sauna owners ({owners.length})
        </Button>
        <Button
          size="sm"
          className={tab === "future" ? "bg-[#2A2118] text-white" : "border border-[#CDBCA8] bg-[#FCF8F3] text-[#2A2118]"}
          onClick={() => setTab("future")}
        >
          Future hosts ({future.length})
        </Button>
        {tab === "owners" ? (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "all")}
            className="ml-2 rounded-lg border border-[#CDBCA8] bg-[#FCF8F3] px-2 py-1.5 text-xs text-[#2A2118]"
          >
            <option value="all">All statuses</option>
            {counts.map(([s, n]) => (
              <option key={s} value={s}>
                {s} ({n})
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9CBB8] p-10 text-center text-sm text-[#6E5B49]">
          No applications here yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((row) => (
            <article key={row.id} className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#2A2118]">
                    {row.full_name ?? row.email}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${STATUS_STYLE[row.status]}`}>
                      {row.status}
                    </span>
                  </p>
                  <p className="text-xs text-[#6E5B49]">
                    <a className="underline" href={`mailto:${row.email}`}>
                      {row.email}
                    </a>
                    {row.phone ? ` · ${row.phone}` : ""} · applied {fmt(row.created_at)}
                    {row.utm_source || row.utm_campaign
                      ? ` · via ${[row.utm_source, row.utm_campaign].filter(Boolean).join(" / ")}`
                      : ""}
                  </p>
                </div>
                {tab === "owners" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(["shortlisted", "founding", "waitlisted", "declined"] as ApplicationStatus[]).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id || row.status === s}
                        className="h-7 border-[#CDBCA8] bg-white text-xs capitalize text-[#2A2118] hover:bg-[#E6D8C6]"
                        onClick={() => void update(row.id, { status: s })}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-[#2A2118] sm:grid-cols-2">
                <div>
                  <dt className="inline text-[#6E5B49]">Sauna: </dt>
                  <dd className="inline">{OWNS_SAUNA_LABEL[row.owns_sauna]}{row.sauna_type ? ` — ${row.sauna_type}` : ""}</dd>
                </div>
                <div>
                  <dt className="inline text-[#6E5B49]">Where: </dt>
                  <dd className="inline">{row.neighborhood ?? "—"}</dd>
                </div>
                {row.private_access ? (
                  <div>
                    <dt className="inline text-[#6E5B49]">Guest access: </dt>
                    <dd className="inline">{PRIVATE_ACCESS_LABEL[row.private_access] ?? row.private_access}</dd>
                  </div>
                ) : null}
                {row.availability ? (
                  <div>
                    <dt className="inline text-[#6E5B49]">Availability: </dt>
                    <dd className="inline">{AVAILABILITY_LABEL[row.availability] ?? row.availability}</dd>
                  </div>
                ) : null}
                {row.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="inline text-[#6E5B49]">Their notes: </dt>
                    <dd className="inline">{row.notes}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex gap-2">
                <input
                  value={notes[row.id] ?? row.admin_note ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  placeholder="Your notes (call scheduled, photos look great…)"
                  className="flex-1 rounded-lg border border-[#D9CBB8] bg-white px-3 py-1.5 text-sm text-[#2A2118]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id || notes[row.id] === undefined}
                  className="border-[#CDBCA8] bg-white text-xs text-[#2A2118] hover:bg-[#E6D8C6]"
                  onClick={() => void update(row.id, { admin_note: notes[row.id] ?? "" })}
                >
                  Save note
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
