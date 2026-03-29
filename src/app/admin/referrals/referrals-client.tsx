"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type CodeRow = {
  id: string
  user_id: string
  code: string
  is_affiliate: boolean | null
  custom_slug: string | null
  reward_override_cents: number | null
  notes: string | null
  is_active: boolean | null
  created_at: string
  profile: { full_name: string | null } | null
  convertedCount: number
  paidOutCents: number
}

export function AdminReferralsClient() {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newUserId, setNewUserId] = useState("")
  const [newSlug, setNewSlug] = useState("")
  const [newReward, setNewReward] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [createBusy, setCreateBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch("/api/admin/referrals")
    const data = (await res.json()) as { codes?: CodeRow[]; error?: string }
    if (!res.ok) {
      setError(data.error ?? "Failed to load")
      setCodes([])
    } else {
      setCodes(data.codes ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleActive(row: CodeRow, next: boolean) {
    setBusyId(row.id)
    setError(null)
    const res = await fetch(`/api/admin/referrals/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      setError(data.error ?? "Update failed")
    } else {
      await load()
    }
    setBusyId(null)
  }

  async function createAffiliate(e: React.FormEvent) {
    e.preventDefault()
    setCreateBusy(true)
    setError(null)
    const rewardTrim = newReward.trim()
    const rewardParsed = rewardTrim ? Number.parseInt(rewardTrim, 10) : null
    const res = await fetch("/api/admin/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: newUserId.trim(),
        customSlug: newSlug.trim(),
        notes: newNotes.trim() || undefined,
        rewardOverrideCents:
          rewardParsed != null && Number.isFinite(rewardParsed) ? rewardParsed : null,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      setError(data.error ?? "Create failed")
    } else {
      setNewUserId("")
      setNewSlug("")
      setNewReward("")
      setNewNotes("")
      await load()
    }
    setCreateBusy(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#9A4A33]" />
      </div>
    )
  }

  return (
    <div className="space-y-8 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl text-[#2A2118]">Referral codes</h1>
        <p className="mt-1 text-sm text-[#6E5B49]">User codes, affiliates, and conversion counts.</p>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <form onSubmit={createAffiliate} className="space-y-4 rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-6">
        <h2 className="text-sm font-semibold text-[#2A2118]">Affiliate / custom slug</h2>
        <p className="text-xs text-[#6E5B49]">
          Ties a public slug (e.g. WELLNESS_BLOG) to a user profile. If they already have a default code row, it is updated.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="aff-user">User ID (uuid)</Label>
            <Input
              id="aff-user"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="Profile / auth user id"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-slug">Custom slug</Label>
            <Input
              id="aff-slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="WELLNESS_BLOG"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-reward">Reward override (¢)</Label>
            <Input
              id="aff-reward"
              value={newReward}
              onChange={(e) => setNewReward(e.target.value)}
              placeholder="1000 = $10, empty = platform default"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="aff-notes">Admin notes</Label>
            <Input id="aff-notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <Button type="submit" disabled={createBusy} className="bg-[#9A4A33] text-white hover:bg-[#853728]">
          {createBusy ? "Saving..." : "Save affiliate code"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-[#E8DCCB] bg-[#F7F0E4] text-xs font-medium text-[#6E5B49]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Affiliate</th>
              <th className="px-4 py-3">Reward ¢</th>
              <th className="px-4 py-3">Converted</th>
              <th className="px-4 py-3">Paid out</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[#6E5B49]">
                  No referral codes yet.
                </td>
              </tr>
            ) : (
              codes.map((row) => (
                <tr key={row.id} className="border-b border-[#F0E8DC] last:border-0">
                  <td className="px-4 py-3 text-[#2A2118]">
                    <span className="block max-w-[10rem] truncate">{row.profile?.full_name ?? "—"}</span>
                    <span className="block max-w-[10rem] truncate font-mono text-[10px] text-[#8D7864]">
                      {row.user_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.custom_slug ?? "—"}</td>
                  <td className="px-4 py-3">{row.is_affiliate ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{row.reward_override_cents ?? "—"}</td>
                  <td className="px-4 py-3">{row.convertedCount}</td>
                  <td className="px-4 py-3">{(row.paidOutCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3">{row.is_active ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === row.id}
                      onClick={() => void toggleActive(row, !row.is_active)}
                    >
                      {row.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
