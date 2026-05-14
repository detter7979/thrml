"use client"

import type { Dispatch, SetStateAction } from "react"
import { useMemo, useState } from "react"

/** Matches admin analytics / settings: cream shell, terracotta accent */
const ACTION_BADGE: Record<string, string> = {
  PAUSED: "bg-rose-100 text-rose-900 ring-1 ring-rose-200",
  SCALED: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  BUDGET_REDUCED: "bg-orange-100 text-orange-900 ring-1 ring-orange-200",
  AB_TEST: "bg-purple-100 text-purple-900 ring-1 ring-purple-200",
  WARNED: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  FLAGGED: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
}
const ACTION_BADGE_DEFAULT = "bg-[#E8DCCB] text-[#2A2118] ring-1 ring-[#D9CBB8]"

export type AbTestLogRow = {
  id: string
  created_at: string
  platform: string
  parent_adset_id: string
  duplicate_adset_id: string
  reason: string | null
  audience_change: string | null
  status: string | null
  winner_id: string | null
  notes: string | null
  goal_type?: string | null
}

export type AgentConfigRow = {
  id: string
  platform: string
  is_active: boolean
  target_cpa: number
  max_cpa_multiplier: number
  scale_threshold: number
  min_spend_to_evaluate: number
  max_days_no_purchase: number
  min_ctr_pct: number
  min_spend_for_ctr: number
  budget_scale_pct: number
  goal_type?: "guest" | "host"
  target_cpa_prospecting?: number | null
  target_cpa_retargeting?: number | null
  warn_days_before_reduce?: number | null
  reduce_days_before_pause?: number | null
  conversion_event?: string | null
  min_conversions_to_scale?: number | null
  ab_test_cpa_threshold?: number | null
  last_run_at?: string | null
  next_run_at?: string | null
  created_at?: string
  updated_at?: string
}

export type AgentDecisionRow = {
  id: string
  evaluated_at: string
  entity_type: string
  entity_id: string
  entity_name: string | null
  parent_entity_id?: string | null
  campaign_id?: string | null
  platform: string
  rule_triggered: string
  spend_at_decision: number | null
  cpa_at_decision: number | null
  target_cpa: number | null
  action_taken: string
  action_executed: boolean
  execution_error: string | null
  requires_creative: boolean
  creative_brief: string | null
  overridden_by_human: boolean
  human_confirmed_at?: string | null
  notes?: string | null
  ab_duplicate_id?: string | null
  goal_type?: string | null
}

export type CreativeQueueRow = {
  id: string
  created_at: string
  platform: string
  priority: string
  reason: string
  concept: string | null
  format: string | null
  ratio: string | null
  cta: string | null
  copy_suggestion: string | null
  hook_suggestion: string | null
  target_adset_id: string | null
  status: string
  notes?: string | null
  queue_type?: string | null
  audience_suggestion?: string | null
  audience_type?: string | null
  source_adset_platform_id?: string | null
  goal_type?: string | null
}

export type CampaignRegistryRow = {
  id: string
  created_at: string
  updated_at?: string
  platform: string
  platform_id: string
  campaign_name: string
  objective: string | null
  aud_type: string | null
  market: string | null
  status: string | null
  daily_budget: number | null
  agent_managed: boolean | null
  goal_type?: "guest" | "host" | null
  campaign_type?: string | null
}

export type AdsetRegistryRow = {
  id: string
  campaign_registry_id: string | null
  platform: string
  platform_id: string
  adset_name: string
  aud_type: string | null
  audience_desc: string | null
  market: string | null
  status: string | null
  daily_budget: number | null
  agent_managed: boolean | null
  created_at: string
  updated_at?: string
  target_cpa_override?: number | null
  warm_up_until?: string | null
  audience_notes?: string | null
  ab_test_generation?: number | null
  ab_test_parent_id?: string | null
  budget_history?: unknown
  last_budget_change_at?: string | null
  goal_type?: "guest" | "host" | null
  funnel_stage?: string | null
  consecutive_warn_days?: number | null
  consecutive_reduce_days?: number | null
  last_warn_date?: string | null
  last_reduce_date?: string | null
}

export type CreativeRegistryRow = {
  id: string
  adset_registry_id: string | null
  platform: string
  platform_id: string
  creative_name: string
  concept: string | null
  format: string | null
  ratio: string | null
  cta: string | null
  copy_variant: string | null
  landing_page: string | null
  status: string | null
  agent_managed: boolean | null
  created_at: string
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function fmtMoney(n: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  return `$${Number(n).toFixed(2)}`
}

function configGoalType(c: AgentConfigRow): "guest" | "host" {
  return c.goal_type === "host" ? "host" : "guest"
}

function funnelStageBadgeClass(fs: string | null | undefined) {
  if (!fs) return "bg-[#E8DCCB] text-[#2A2118] ring-1 ring-[#D9CBB8]"
  if (fs === "retargeting" || fs === "host_retargeting")
    return "bg-orange-100 text-orange-900 ring-1 ring-orange-200"
  if (fs === "lal") return "bg-purple-100 text-purple-900 ring-1 ring-purple-200"
  if (fs === "consideration" || fs === "host_interest")
    return "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
  if (fs === "awareness") return "bg-stone-200 text-stone-800 ring-1 ring-stone-300"
  return "bg-[#E8DCCB] text-[#2A2118] ring-1 ring-[#D9CBB8]"
}

async function patchConfig(platform: string, goalType: string, field: string, value: unknown) {
  const res = await fetch("/api/admin/agent/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, goal_type: goalType, field, value }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed")
  return res.json() as Promise<{ config: AgentConfigRow }>
}

async function postOverride(decisionId: string, action: "reactivate" | "confirm") {
  const res = await fetch("/api/admin/agent/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision_id: decisionId, action }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Override failed")
  return json
}

async function patchQueue(id: string, status: string) {
  const res = await fetch("/api/admin/agent/creative-queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed")
  return res.json()
}

async function postRegistry(payload: {
  platform: string
  entity_type?: string
  data: Record<string, unknown>
}) {
  const res = await fetch("/api/admin/agent/registry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Register failed")
  return res.json() as Promise<{
    campaign: CampaignRegistryRow | null
    adset: AdsetRegistryRow | null
    creative: CreativeRegistryRow | null
  }>
}

async function patchAdsetConfig(platformId: string, platform: string, field: string, value: unknown) {
  const res = await fetch("/api/admin/agent/adset-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform_id: platformId, platform, field, value }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed")
  return json as { adset: AdsetRegistryRow }
}

async function patchAbTest(
  id: string,
  body: { status?: string; winner_id?: string | null; notes?: string | null }
) {
  const res = await fetch("/api/admin/agent/ab-tests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed")
  return json as { test: AbTestLogRow }
}

function AbTestRowEditor({
  row,
  onUpdate,
}: {
  row: AbTestLogRow
  onUpdate: (next: AbTestLogRow) => void
}) {
  const [status, setStatus] = useState(row.status ?? "RUNNING")
  const [winnerId, setWinnerId] = useState(row.winner_id ?? "")
  const [notes, setNotes] = useState(row.notes ?? "")
  const [saving, setSaving] = useState(false)

  return (
    <tr className="border-b border-[#E8DCCD] align-top text-sm text-[#2A2118]">
      <td className="px-3 py-2 whitespace-nowrap text-[#6E5B49]">{fmtDate(row.created_at)}</td>
      <td className="px-3 py-2">{row.platform}</td>
      <td className="px-3 py-2 font-mono text-xs text-[#5E4E42]" title={row.parent_adset_id}>
        {row.parent_adset_id.length > 10 ? `${row.parent_adset_id.slice(0, 10)}…` : row.parent_adset_id}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-[#5E4E42]" title={row.duplicate_adset_id}>
        {row.duplicate_adset_id.length > 10 ? `${row.duplicate_adset_id.slice(0, 10)}…` : row.duplicate_adset_id}
      </td>
      <td className="px-3 py-2 max-w-[200px] text-xs text-[#6E5B49]">{row.audience_change ?? "—"}</td>
      <td className="px-3 py-2">
        <select
          className="max-w-[140px] rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="RUNNING">RUNNING</option>
          <option value="WINNER_A">WINNER_A</option>
          <option value="WINNER_B">WINNER_B</option>
          <option value="INCONCLUSIVE">INCONCLUSIVE</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full min-w-[100px] rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-xs font-mono text-[#2A2118]"
          value={winnerId}
          onChange={(e) => setWinnerId(e.target.value)}
          placeholder="Winner ad set ID"
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          className="w-full min-w-[120px] rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118]"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          className="rounded-full border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118] hover:bg-[#E8DCCB]"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              const { test } = await patchAbTest(row.id, {
                status,
                winner_id: winnerId.trim() || null,
                notes: notes.trim() || null,
              })
              onUpdate(test)
            } finally {
              setSaving(false)
            }
          }}
        >
          Save
        </button>
      </td>
    </tr>
  )
}

function AdsetRegistryTable({
  adsets,
  busy,
  setBusy,
  setMessage,
  setAdsets,
}: {
  adsets: AdsetRegistryRow[]
  busy: string | null
  setBusy: (v: string | null) => void
  setMessage: (v: string | null) => void
  setAdsets: Dispatch<SetStateAction<AdsetRegistryRow[]>>
}) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3]">
      <table className="w-full min-w-[1280px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#D9CBB8] text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
            <th className="px-3 py-2">Ad set</th>
            <th className="px-3 py-2">Platform</th>
            <th className="px-3 py-2">Goal</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Cascade</th>
            <th className="px-3 py-2">Platform ID</th>
            <th className="px-3 py-2">CPA override</th>
            <th className="px-3 py-2">Warm-up</th>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 min-w-[200px]">Audience notes</th>
          </tr>
        </thead>
        <tbody>
          {adsets.map((r) => {
            const wu = r.warm_up_until ? String(r.warm_up_until).slice(0, 10) : null
            const inWarmUp = Boolean(wu && today <= wu)
            return (
              <tr key={r.id} className="border-b border-[#E8DCCD] align-top text-[#2A2118]">
                <td className="px-3 py-2 font-medium">{r.adset_name}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{r.platform}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      r.goal_type === "host"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                    title={r.goal_type === "host" ? "Host" : "Guest"}
                  >
                    {r.goal_type === "host" ? "🏠" : "🛒"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-medium ${funnelStageBadgeClass(r.funnel_stage)}`}
                  >
                    {r.funnel_stage ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-[#5E4E42]">
                  {r.consecutive_warn_days ?? 0}W / {r.consecutive_reduce_days ?? 0}R
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[#5E4E42]">{r.platform_id}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-24 rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118]"
                    defaultValue={r.target_cpa_override ?? ""}
                    placeholder="inherit"
                    disabled={!!busy}
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      const key = `cpa-${r.id}`
                      setBusy(key)
                      setMessage(null)
                      try {
                        const val = raw === "" ? null : Number(raw)
                        const { adset } = await patchAdsetConfig(
                          r.platform_id,
                          r.platform,
                          "target_cpa_override",
                          val
                        )
                        setAdsets((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...adset } : x)))
                        setMessage("Saved")
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Error")
                      } finally {
                        setBusy(null)
                      }
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-[#6E5B49]">
                  {inWarmUp ? (
                    <div className="flex flex-col gap-1">
                      <span>{wu}</span>
                      <button
                        type="button"
                        className="rounded-full border border-[#D9CBB8] bg-white px-2 py-0.5 text-[10px] text-[#2A2118] hover:bg-[#E8DCCB]"
                        disabled={busy === `wu-${r.id}`}
                        onClick={async () => {
                          setBusy(`wu-${r.id}`)
                          setMessage(null)
                          try {
                            const { adset } = await patchAdsetConfig(
                              r.platform_id,
                              r.platform,
                              "warm_up_until",
                              null
                            )
                            setAdsets((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...adset } : x)))
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : "Error")
                          } finally {
                            setBusy(null)
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="text-[#8A7968]">Active</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#C75B3A]"
                    checked={r.agent_managed !== false}
                    disabled={busy === `am-${r.id}`}
                    onChange={async (e) => {
                      setBusy(`am-${r.id}`)
                      setMessage(null)
                      try {
                        const { adset } = await patchAdsetConfig(
                          r.platform_id,
                          r.platform,
                          "agent_managed",
                          e.target.checked
                        )
                        setAdsets((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...adset } : x)))
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Error")
                      } finally {
                        setBusy(null)
                      }
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-[#6E5B49]">{r.market ?? "—"}</td>
                <td className="px-3 py-2 text-[#6E5B49]">{r.status ?? "—"}</td>
                <td className="px-3 py-2">
                  <textarea
                    key={`${r.id}-notes-${r.audience_notes ?? ""}`}
                    className="w-full min-h-[52px] rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118]"
                    defaultValue={r.audience_notes ?? ""}
                    disabled={!!busy}
                    onBlur={async (e) => {
                      const v = e.target.value
                      if (v === (r.audience_notes ?? "")) return
                      setBusy(`an-${r.id}`)
                      setMessage(null)
                      try {
                        const { adset } = await patchAdsetConfig(
                          r.platform_id,
                          r.platform,
                          "audience_notes",
                          v.trim() || null
                        )
                        setAdsets((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...adset } : x)))
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Error")
                      } finally {
                        setBusy(null)
                      }
                    }}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AdminAgentClient({
  initialConfigs,
  initialDecisions,
  initialAbTests,
  initialQueue,
  initialCampaigns,
  initialAdsets,
  initialCreatives,
}: {
  initialConfigs: AgentConfigRow[]
  initialDecisions: AgentDecisionRow[]
  initialAbTests: AbTestLogRow[]
  initialQueue: CreativeQueueRow[]
  initialCampaigns: CampaignRegistryRow[]
  initialAdsets: AdsetRegistryRow[]
  initialCreatives: CreativeRegistryRow[]
}) {
  const [configs, setConfigs] = useState(initialConfigs)
  const [decisions] = useState(initialDecisions)
  const [abTests, setAbTests] = useState(initialAbTests)
  const [queue, setQueue] = useState(initialQueue)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [adsets, setAdsets] = useState(initialAdsets)
  const [creatives, setCreatives] = useState(initialCreatives)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [platFilter, setPlatFilter] = useState<string>("all")
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [goalFilter, setGoalFilter] = useState<string>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [formPlatform, setFormPlatform] = useState("meta")
  const [formGoalType, setFormGoalType] = useState<"guest" | "host">("guest")
  const [formCampaignType, setFormCampaignType] = useState("retargeting")
  const [formFunnelStage, setFormFunnelStage] = useState("retargeting")
  const [formObjective, setFormObjective] = useState("Conversions")
  const [formDesc, setFormDesc] = useState("")
  const [formMarket, setFormMarket] = useState("")
  const [formCampaignId, setFormCampaignId] = useState("")
  const [formAdsetId, setFormAdsetId] = useState("")
  const [formCreativeOnly, setFormCreativeOnly] = useState(false)
  const [formLinkAdsetRegistryId, setFormLinkAdsetRegistryId] = useState("")
  const [formCreativePlatformId, setFormCreativePlatformId] = useState("")
  const [formCreativeName, setFormCreativeName] = useState("")
  const [formConcept, setFormConcept] = useState("")
  const [formFormat, setFormFormat] = useState("")
  const [formRatio, setFormRatio] = useState("")
  const [formCta, setFormCta] = useState("BookNow")
  const [formCopyVariant, setFormCopyVariant] = useState("")
  const [formLandingPage, setFormLandingPage] = useState("")

  const guestConfigs = useMemo(
    () => configs.filter((c) => c.goal_type === "guest" || c.goal_type == null),
    [configs]
  )
  const hostConfigs = useMemo(() => configs.filter((c) => c.goal_type === "host"), [configs])

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      if (platFilter !== "all" && d.platform !== platFilter) return false
      if (actionFilter !== "all" && d.action_taken !== actionFilter) return false
      if (goalFilter !== "all" && (d.goal_type ?? "guest") !== goalFilter) return false
      const at = d.evaluated_at
      if (from) {
        const day = at.slice(0, 10)
        if (day < from) return false
      }
      if (to) {
        const day = at.slice(0, 10)
        if (day > to) return false
      }
      return true
    })
  }, [decisions, platFilter, actionFilter, goalFilter, from, to])

  async function saveField(platform: string, goalType: string, field: string, raw: string) {
    const key = `${platform}-${goalType}-${field}`
    setBusy(key)
    setMessage(null)
    try {
      const value = Number(raw)
      const { config } = await patchConfig(platform, goalType, field, value)
      setConfigs((prev) =>
        prev.map((c) => (c.platform === platform && configGoalType(c) === goalType ? { ...c, ...config } : c))
      )
      setMessage("Saved")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error")
    } finally {
      setBusy(null)
    }
  }

  async function saveActive(platform: string, goalType: string, isActive: boolean) {
    const key = `${platform}-${goalType}-is_active`
    setBusy(key)
    setMessage(null)
    try {
      const { config } = await patchConfig(platform, goalType, "is_active", isActive)
      setConfigs((prev) =>
        prev.map((c) => (c.platform === platform && configGoalType(c) === goalType ? { ...c, ...config } : c))
      )
      setMessage("Saved")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8 px-6 py-8 text-[#2A2118]">
      <header className="border-b border-[#D9CBB8] pb-6">
        <h1 className="font-serif text-3xl lowercase tracking-tight text-[#2A2118]">ads agent</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#6E5B49]">
          Automated rules evaluate Meta and Google Ads performance daily. Actions are logged first; pauses can be
          reversed from the decision log.
        </p>
      </header>

      {message ? <p className="text-sm font-medium text-[#9A4A33]">{message}</p> : null}

      {/* Section 1 — Config */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Agent status &amp; config</h2>
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-800">
              🛒 Guest campaigns — booking acquisition
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {guestConfigs.map((c) => {
                const gt = configGoalType(c)
                const busyPfx = `${c.platform}-${gt}-`
                return (
                  <div key={`${c.platform}-${gt}`} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-lg font-medium uppercase text-[#2A2118]">
                        {c.platform}{" "}
                        <span className="text-sm font-normal text-[#6E5B49]">(guest)</span>
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#6E5B49]">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          className="size-4 accent-[#C75B3A]"
                          checked={c.is_active}
                          disabled={busy === `${busyPfx}is_active`}
                          onChange={(e) => void saveActive(c.platform, gt, e.target.checked)}
                        />
                      </label>
                    </div>
                    <div className="mb-3 flex justify-between text-xs text-[#6E5B49]">
                      <span>Conversion event</span>
                      <span className="font-mono font-medium text-[#2A2118]">{c.conversion_event ?? "purchase"}</span>
                    </div>
                    <dl className="grid grid-cols-1 gap-3 text-sm">
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-target_cpa-${c.target_cpa}`}
                        label="Target CPA ($)"
                        value={c.target_cpa}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-tcp-${c.target_cpa_prospecting}`}
                        label="Target CPA: Prospecting ($)"
                        value={c.target_cpa_prospecting ?? 0}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa_prospecting", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-tcr-${c.target_cpa_retargeting}`}
                        label="Target CPA: Retargeting ($)"
                        value={c.target_cpa_retargeting ?? 0}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa_retargeting", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-warn-${c.warn_days_before_reduce}`}
                        label="Warn days before budget reduction"
                        value={c.warn_days_before_reduce ?? 3}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "warn_days_before_reduce", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-red-${c.reduce_days_before_pause}`}
                        label="Reduce days before auto-pause"
                        value={c.reduce_days_before_pause ?? 7}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "reduce_days_before_pause", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-minconv-${c.min_conversions_to_scale}`}
                        label="Min conversions to trigger scale"
                        value={c.min_conversions_to_scale ?? 3}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_conversions_to_scale", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-ab-${c.ab_test_cpa_threshold}`}
                        label="A/B test CPA threshold (0–1)"
                        value={c.ab_test_cpa_threshold ?? 0.6}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "ab_test_cpa_threshold", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-max_cpa_multiplier-${c.max_cpa_multiplier}`}
                        label="Max CPA multiplier"
                        value={c.max_cpa_multiplier}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "max_cpa_multiplier", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_spend-${c.min_spend_to_evaluate}`}
                        label="Min spend to evaluate ($)"
                        value={c.min_spend_to_evaluate}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_spend_to_evaluate", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-budget_scale-${c.budget_scale_pct}`}
                        label="Budget scale % (0–1)"
                        value={c.budget_scale_pct}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "budget_scale_pct", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-scale_threshold-${c.scale_threshold}`}
                        label="Scale threshold (0–1, CPA ratio)"
                        value={c.scale_threshold}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "scale_threshold", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_ctr-${c.min_ctr_pct}`}
                        label="Min CTR threshold (0–1)"
                        value={c.min_ctr_pct}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_ctr_pct", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_spend_ctr-${c.min_spend_for_ctr}`}
                        label="Min spend for CTR eval ($)"
                        value={c.min_spend_for_ctr}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_spend_for_ctr", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-max_days-${c.max_days_no_purchase}`}
                        label="Max days without purchase"
                        value={c.max_days_no_purchase}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "max_days_no_purchase", v)}
                      />
                    </dl>
                    <div className="mt-4 border-t border-[#E8DCCD] pt-3 text-xs text-[#6E5B49]">
                      <p>Last run: {c.last_run_at ? fmtDate(c.last_run_at) : "—"}</p>
                      <p>
                        Next scheduled:{" "}
                        {c.next_run_at ? fmtDate(c.next_run_at) : "Daily ~03:00 UTC (Vercel cron)"}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="border-t border-[#E8DCCD] pt-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-800">
              🏠 Host campaigns — host acquisition
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {hostConfigs.map((c) => {
                const gt = configGoalType(c)
                const busyPfx = `${c.platform}-${gt}-`
                return (
                  <div key={`${c.platform}-${gt}`} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-lg font-medium uppercase text-[#2A2118]">
                        {c.platform}{" "}
                        <span className="text-sm font-normal text-[#6E5B49]">(host)</span>
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#6E5B49]">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          className="size-4 accent-[#C75B3A]"
                          checked={c.is_active}
                          disabled={busy === `${busyPfx}is_active`}
                          onChange={(e) => void saveActive(c.platform, gt, e.target.checked)}
                        />
                      </label>
                    </div>
                    <div className="mb-3 flex justify-between text-xs text-[#6E5B49]">
                      <span>Conversion event</span>
                      <span className="font-mono font-medium text-[#2A2118]">{c.conversion_event ?? "purchase"}</span>
                    </div>
                    <dl className="grid grid-cols-1 gap-3 text-sm">
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-target_cpa-${c.target_cpa}`}
                        label="Target CPA ($)"
                        value={c.target_cpa}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-tcp-${c.target_cpa_prospecting}`}
                        label="Target CPA: Prospecting ($)"
                        value={c.target_cpa_prospecting ?? 0}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa_prospecting", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-tcr-${c.target_cpa_retargeting}`}
                        label="Target CPA: Retargeting ($)"
                        value={c.target_cpa_retargeting ?? 0}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "target_cpa_retargeting", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-warn-${c.warn_days_before_reduce}`}
                        label="Warn days before budget reduction"
                        value={c.warn_days_before_reduce ?? 3}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "warn_days_before_reduce", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-red-${c.reduce_days_before_pause}`}
                        label="Reduce days before auto-pause"
                        value={c.reduce_days_before_pause ?? 7}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "reduce_days_before_pause", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-minconv-${c.min_conversions_to_scale}`}
                        label="Min conversions to trigger scale"
                        value={c.min_conversions_to_scale ?? 3}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_conversions_to_scale", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-ab-${c.ab_test_cpa_threshold}`}
                        label="A/B test CPA threshold (0–1)"
                        value={c.ab_test_cpa_threshold ?? 0.6}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "ab_test_cpa_threshold", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-max_cpa_multiplier-${c.max_cpa_multiplier}`}
                        label="Max CPA multiplier"
                        value={c.max_cpa_multiplier}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "max_cpa_multiplier", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_spend-${c.min_spend_to_evaluate}`}
                        label="Min spend to evaluate ($)"
                        value={c.min_spend_to_evaluate}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_spend_to_evaluate", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-budget_scale-${c.budget_scale_pct}`}
                        label="Budget scale % (0–1)"
                        value={c.budget_scale_pct}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "budget_scale_pct", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-scale_threshold-${c.scale_threshold}`}
                        label="Scale threshold (0–1, CPA ratio)"
                        value={c.scale_threshold}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "scale_threshold", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_ctr-${c.min_ctr_pct}`}
                        label="Min CTR threshold (0–1)"
                        value={c.min_ctr_pct}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_ctr_pct", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-min_spend_ctr-${c.min_spend_for_ctr}`}
                        label="Min spend for CTR eval ($)"
                        value={c.min_spend_for_ctr}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "min_spend_for_ctr", v)}
                      />
                      <ConfigNumRow
                        key={`${c.platform}-${gt}-max_days-${c.max_days_no_purchase}`}
                        label="Max days without purchase"
                        value={c.max_days_no_purchase}
                        disabled={!!busy?.startsWith(busyPfx)}
                        onCommit={(v) => void saveField(c.platform, gt, "max_days_no_purchase", v)}
                      />
                    </dl>
                    <div className="mt-4 border-t border-[#E8DCCD] pt-3 text-xs text-[#6E5B49]">
                      <p>Last run: {c.last_run_at ? fmtDate(c.last_run_at) : "—"}</p>
                      <p>
                        Next scheduled:{" "}
                        {c.next_run_at ? fmtDate(c.next_run_at) : "Daily ~03:00 UTC (Vercel cron)"}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Decisions */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Decision log</h2>
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <select
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
            value={platFilter}
            onChange={(e) => setPlatFilter(e.target.value)}
          >
            <option value="all">All platforms</option>
            <option value="meta">meta</option>
            <option value="google">google</option>
          </select>
          <select
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">All actions</option>
            <option value="PAUSED">PAUSED</option>
            <option value="SCALED">SCALED</option>
            <option value="BUDGET_REDUCED">BUDGET_REDUCED</option>
            <option value="AB_TEST">AB_TEST</option>
            <option value="WARNED">WARNED</option>
            <option value="FLAGGED">FLAGGED</option>
          </select>
          <select
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
            value={goalFilter}
            onChange={(e) => setGoalFilter(e.target.value)}
          >
            <option value="all">All goals</option>
            <option value="guest">Guest (bookings)</option>
            <option value="host">Host (signups)</option>
          </select>
          <input
            type="date"
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#D9CBB8] text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Goal</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">CPA</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Executed</th>
                <th className="px-3 py-2">Override</th>
              </tr>
            </thead>
            <tbody>
              {filteredDecisions.map((d) => {
                const badgeClass = ACTION_BADGE[d.action_taken] ?? ACTION_BADGE_DEFAULT
                const g = d.goal_type ?? "guest"
                return (
                  <tr key={d.id} className="border-b border-[#E8DCCD] text-[#2A2118]">
                    <td className="px-3 py-2 whitespace-nowrap text-[#6E5B49]">{fmtDate(d.evaluated_at)}</td>
                    <td className="px-3 py-2">{d.platform}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          g === "host" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                        title={g === "host" ? "Host" : "Guest"}
                      >
                        {g === "host" ? "🏠" : "🛒"}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <div className="truncate font-medium">{d.entity_name ?? "—"}</div>
                      <div className="truncate text-xs text-[#8A7968]">{d.entity_type}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[280px] text-xs text-[#6E5B49]">{d.rule_triggered}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                        {d.action_taken}
                      </span>
                    </td>
                    <td className="px-3 py-2">{fmtMoney(d.cpa_at_decision)}</td>
                    <td className="px-3 py-2">{fmtMoney(d.target_cpa)}</td>
                    <td className="px-3 py-2">{d.action_executed ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">
                      {d.action_taken === "PAUSED" ? (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="rounded-full border border-[#D9CBB8] bg-white px-2 py-1 text-xs text-[#2A2118] hover:bg-[#E8DCCB]"
                            disabled={busy === d.id}
                            onClick={async () => {
                              setBusy(d.id)
                              setMessage(null)
                              try {
                                await postOverride(d.id, "reactivate")
                                setMessage("Reactivate requested")
                              } catch (e) {
                                setMessage(e instanceof Error ? e.message : "Error")
                              } finally {
                                setBusy(null)
                              }
                            }}
                          >
                            Reactivate
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#D9CBB8] bg-[#FCF8F3] px-2 py-1 text-xs text-[#6E5B49] hover:bg-[#E8DCCB]"
                            disabled={busy === `${d.id}-c`}
                            onClick={async () => {
                              setBusy(`${d.id}-c`)
                              try {
                                await postOverride(d.id, "confirm")
                                setMessage("Confirmed")
                              } catch (e) {
                                setMessage(e instanceof Error ? e.message : "Error")
                              } finally {
                                setBusy(null)
                              }
                            }}
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* A/B tests */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">A/B tests</h2>
        <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#D9CBB8] text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Original</th>
                <th className="px-3 py-2">Duplicate</th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Winner ID</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {abTests.map((t) => (
                <AbTestRowEditor
                  key={t.id}
                  row={t}
                  onUpdate={(next) => setAbTests((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 — Creative queue */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Creative queue</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {queue.map((item) => {
            const prClass =
              item.priority === "HIGH"
                ? "bg-rose-100 text-rose-900 ring-1 ring-rose-200"
                : item.priority === "MEDIUM"
                  ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                  : "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
            const isAudience = item.queue_type === "audience"
            return (
              <article key={item.id} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${prClass}`}>{item.priority}</span>
                    {isAudience ? (
                      <span className="rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-900 ring-1 ring-purple-200">
                        AUDIENCE
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8A7968]">{item.status}</span>
                </div>
                <p className="text-sm text-[#2A2118]">{item.reason}</p>
                {isAudience ? (
                  <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
                    <p className="font-medium text-purple-900">Audience to test</p>
                    <p className="mt-1 text-purple-950">
                      {item.audience_suggestion ?? item.copy_suggestion ?? "—"}
                    </p>
                    {item.source_adset_platform_id ? (
                      <p className="mt-2 text-xs text-[#6E5B49]">Source ad set: {item.source_adset_platform_id}</p>
                    ) : null}
                    {item.copy_suggestion && item.audience_suggestion ? (
                      <p className="mt-2 text-xs leading-relaxed text-[#5E4E42] whitespace-pre-wrap">
                        {item.copy_suggestion}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-[#6E5B49]">
                      {[item.concept, item.format, item.ratio, item.cta].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {item.copy_suggestion ? (
                      <p className="mt-2 text-sm leading-relaxed text-[#5E4E42]">{item.copy_suggestion}</p>
                    ) : null}
                    {item.hook_suggestion ? (
                      <p className="mt-1 text-xs italic text-[#6E5B49]">{item.hook_suggestion}</p>
                    ) : null}
                  </>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#C75B3A] bg-white px-3 py-1 text-xs font-medium text-[#C75B3A] hover:bg-[#FFF5F0]"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id)
                      try {
                        await patchQueue(item.id, "IN_PROGRESS")
                        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "IN_PROGRESS" } : x)))
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#D9CBB8] bg-white px-3 py-1 text-xs text-[#2A2118] hover:bg-[#E8DCCB]"
                    disabled={busy === `${item.id}-d`}
                    onClick={async () => {
                      setBusy(`${item.id}-d`)
                      try {
                        await patchQueue(item.id, "DONE")
                        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "DONE" } : x)))
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Mark done
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Section 4 — Registry */}
      <section className="pb-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Registries</h2>
          <button
            type="button"
            className="rounded-full bg-[#C75B3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#AF4D31]"
            onClick={() => setModalOpen(true)}
          >
            Register new
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#D9CBB8] text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Goal</th>
                <th className="px-3 py-2">Platform ID</th>
                <th className="px-3 py-2">Objective</th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2">Daily $</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((r) => (
                <tr key={r.id} className="border-b border-[#E8DCCD] text-[#2A2118]">
                  <td className="px-3 py-2 font-medium">{r.campaign_name}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.platform}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        r.goal_type === "host" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {r.goal_type === "host" ? "🏠" : "🛒"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[#5E4E42]">{r.platform_id}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.objective ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.aud_type ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.market ?? "—"}</td>
                  <td className="px-3 py-2">{r.daily_budget != null ? fmtMoney(r.daily_budget) : "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Ad set registry</h3>
        <AdsetRegistryTable
          adsets={adsets}
          busy={busy}
          setBusy={setBusy}
          setMessage={setMessage}
          setAdsets={setAdsets}
        />

        <h3 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wide text-[#6E5B49]">Creative registry</h3>
        <div className="overflow-x-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#D9CBB8] text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                <th className="px-3 py-2">Creative</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Platform ID</th>
                <th className="px-3 py-2">Ad set row</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">CTA</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((r) => (
                <tr key={r.id} className="border-b border-[#E8DCCD] text-[#2A2118]">
                  <td className="px-3 py-2 font-medium">{r.creative_name}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.platform}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#5E4E42]">{r.platform_id}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#8A7968]">{r.adset_registry_id ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.format ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.cta ?? "—"}</td>
                  <td className="px-3 py-2 text-[#6E5B49]">{r.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-6 text-[#2A2118] shadow-lg">
            <h3 className="mb-4 font-medium text-[#2A2118]">
              {formCreativeOnly ? "Register creative" : "Register campaign / ad set / creative"}
            </h3>
            <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-[#5E4E42]">
              <input
                type="checkbox"
                className="size-4 accent-[#C75B3A]"
                checked={formCreativeOnly}
                onChange={(e) => setFormCreativeOnly(e.target.checked)}
              />
              Creative only — attach to an existing ad set row (no new campaign)
            </label>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Platform</span>
                <select
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value)}
                >
                  <option value="meta">Meta</option>
                  <option value="google">Google</option>
                </select>
              </label>
              {formCreativeOnly ? (
                <label className="grid gap-1">
                  <span className="text-xs text-[#6E5B49]">Ad set (registry row)</span>
                  <select
                    className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                    value={formLinkAdsetRegistryId}
                    onChange={(e) => setFormLinkAdsetRegistryId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {adsets
                      .filter((a) => a.platform === formPlatform)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.adset_name} · {a.platform_id.slice(0, 12)}
                          {a.platform_id.length > 12 ? "…" : ""}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              {!formCreativeOnly ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Goal type</span>
                    <select
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formGoalType}
                      onChange={(e) => {
                        const v = e.target.value as "guest" | "host"
                        setFormGoalType(v)
                        setFormFunnelStage(v === "host" ? "host_retargeting" : "retargeting")
                      }}
                    >
                      <option value="guest">Guest — booking acquisition</option>
                      <option value="host">Host — host acquisition</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Campaign type</span>
                    <select
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formCampaignType}
                      onChange={(e) => setFormCampaignType(e.target.value)}
                    >
                      <option value="retargeting">Retargeting</option>
                      <option value="prospecting">Prospecting</option>
                      {formGoalType === "host" ? (
                        <option value="host_acquisition">Host acquisition</option>
                      ) : null}
                      <option value="mixed">Mixed</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Funnel stage</span>
                    <select
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formFunnelStage}
                      onChange={(e) => setFormFunnelStage(e.target.value)}
                    >
                      {formGoalType === "guest" ? (
                        <>
                          <option value="retargeting">Retargeting</option>
                          <option value="lal">Lookalike (LAL)</option>
                          <option value="consideration">Consideration / interest</option>
                          <option value="awareness">Awareness / broad</option>
                        </>
                      ) : (
                        <>
                          <option value="host_retargeting">Host retargeting</option>
                          <option value="host_interest">Host interest / prospecting</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Objective</span>
                    <select
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formObjective}
                      onChange={(e) => setFormObjective(e.target.value)}
                    >
                      <option value="Conversions">Conversions</option>
                      <option value="Traffic">Traffic</option>
                      <option value="Awareness">Awareness</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Description</span>
                    <input
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Market</span>
                    <input
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formMarket}
                      onChange={(e) => setFormMarket(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Platform campaign ID (optional)</span>
                    <input
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formCampaignId}
                      onChange={(e) => setFormCampaignId(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-[#6E5B49]">Platform ad set ID (optional)</span>
                    <input
                      className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                      value={formAdsetId}
                      onChange={(e) => setFormAdsetId(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              <p className="mt-2 border-t border-[#E8DCCD] pt-3 text-xs font-medium uppercase tracking-wide text-[#6E5B49]">
                {formCreativeOnly ? "Creative" : "Creative (optional)"}
              </p>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Platform creative / ad ID</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 font-mono text-xs text-[#2A2118]"
                  value={formCreativePlatformId}
                  onChange={(e) => setFormCreativePlatformId(e.target.value)}
                  placeholder={formCreativeOnly ? "Required" : "Optional"}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Creative name</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formCreativeName}
                  onChange={(e) => setFormCreativeName(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Concept</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formConcept}
                  onChange={(e) => setFormConcept(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Format</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formFormat}
                  onChange={(e) => setFormFormat(e.target.value)}
                  placeholder="e.g. VID, RSA"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Ratio</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formRatio}
                  onChange={(e) => setFormRatio(e.target.value)}
                  placeholder="e.g. 9x16"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">CTA</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formCta}
                  onChange={(e) => setFormCta(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Copy variant</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formCopyVariant}
                  onChange={(e) => setFormCopyVariant(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-[#6E5B49]">Landing page URL</span>
                <input
                  className="rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-[#2A2118]"
                  value={formLandingPage}
                  onChange={(e) => setFormLandingPage(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[#D9CBB8] bg-white px-4 py-2 text-sm text-[#2A2118] hover:bg-[#E8DCCB]"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[#C75B3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#AF4D31] disabled:opacity-50"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("reg")
                  setMessage(null)
                  try {
                    if (formCreativeOnly) {
                      if (!formLinkAdsetRegistryId || !formCreativePlatformId.trim()) {
                        setMessage("Select an ad set and enter the platform creative or ad ID.")
                        return
                      }
                      const { creative } = await postRegistry({
                        platform: formPlatform,
                        entity_type: "creative",
                        data: {
                          creative_only: true,
                          adset_registry_id: formLinkAdsetRegistryId,
                          platform_creative_id: formCreativePlatformId.trim(),
                          creative_name: formCreativeName.trim() || undefined,
                          concept: formConcept.trim() || undefined,
                          format: formFormat.trim() || undefined,
                          ratio: formRatio.trim() || undefined,
                          cta: formCta.trim() || undefined,
                          copy_variant: formCopyVariant.trim() || undefined,
                          landing_page: formLandingPage.trim() || undefined,
                        },
                      })
                      if (creative) {
                        setCreatives((prev) => {
                          const rest = prev.filter(
                            (c) => !(c.platform === creative.platform && c.platform_id === creative.platform_id)
                          )
                          return [creative, ...rest]
                        })
                      }
                      setModalOpen(false)
                      setFormCreativeOnly(false)
                      setFormLinkAdsetRegistryId("")
                      setFormCreativePlatformId("")
                      setFormCreativeName("")
                      setFormConcept("")
                      setFormFormat("")
                      setFormRatio("")
                      setFormCta("BookNow")
                      setFormCopyVariant("")
                      setFormLandingPage("")
                      setFormGoalType("guest")
                      setFormCampaignType("retargeting")
                      setFormFunnelStage("retargeting")
                      return
                    }

                    const parts = [
                      formPlatform,
                      formGoalType,
                      formObjective,
                      formCampaignType,
                      formFunnelStage,
                      formMarket,
                      formDesc,
                    ].filter(Boolean)
                    const display_name = parts.join(" · ") || `registry-${Date.now()}`
                    const { campaign, adset, creative } = await postRegistry({
                      platform: formPlatform,
                      entity_type: "campaign",
                      data: {
                        display_name,
                        objective: formObjective,
                        audience_type: formFunnelStage,
                        goal_type: formGoalType,
                        campaign_type: formCampaignType,
                        funnel_stage: formFunnelStage,
                        description: formDesc,
                        market: formMarket,
                        platform_campaign_id: formCampaignId || undefined,
                        platform_adset_id: formAdsetId || undefined,
                        platform_creative_id: formCreativePlatformId.trim() || undefined,
                        creative_name: formCreativeName.trim() || undefined,
                        concept: formConcept.trim() || undefined,
                        format: formFormat.trim() || undefined,
                        ratio: formRatio.trim() || undefined,
                        cta: formCta.trim() || undefined,
                        copy_variant: formCopyVariant.trim() || undefined,
                        landing_page: formLandingPage.trim() || undefined,
                      },
                    })
                    if (campaign) {
                      setCampaigns((prev) => {
                        const rest = prev.filter(
                          (c) => !(c.platform === campaign.platform && c.platform_id === campaign.platform_id)
                        )
                        return [campaign, ...rest]
                      })
                    }
                    if (adset) {
                      setAdsets((prev) => {
                        const rest = prev.filter(
                          (a) => !(a.platform === adset.platform && a.platform_id === adset.platform_id)
                        )
                        return [adset, ...rest]
                      })
                    }
                    if (creative) {
                      setCreatives((prev) => {
                        const rest = prev.filter(
                          (c) => !(c.platform === creative.platform && c.platform_id === creative.platform_id)
                        )
                        return [creative, ...rest]
                      })
                    }
                    setModalOpen(false)
                    setFormDesc("")
                    setFormMarket("")
                    setFormCampaignId("")
                    setFormAdsetId("")
                    setFormCreativePlatformId("")
                    setFormCreativeName("")
                    setFormConcept("")
                    setFormFormat("")
                    setFormRatio("")
                    setFormCta("BookNow")
                    setFormCopyVariant("")
                    setFormLandingPage("")
                    setFormGoalType("guest")
                    setFormCampaignType("retargeting")
                    setFormFunnelStage("retargeting")
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "Error")
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ConfigNumRow({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(String(value))
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[#6E5B49]">{label}</span>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onCommit(local)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </div>
    </div>
  )
}
