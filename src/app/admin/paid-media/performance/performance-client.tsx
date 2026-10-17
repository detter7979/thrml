"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type Row = Record<string, string | number>

const GROUPS = {
  campaign: { label: "Campaign", keys: ["Platform", "Namer Campaign", "Campaign Name"] },
  ad_set: { label: "Ad set", keys: ["Platform", "Namer Campaign", "Namer Ad Set", "Ad Set Name", "Audience Src", "Placement"] },
  ad: { label: "Ad", keys: ["Platform", "Namer Campaign", "Namer Ad Set", "Namer Ad", "Ad Name", "Angle", "Format"] },
  day: { label: "Day", keys: ["Date"] },
  week: { label: "Week", keys: ["Week"] },
  persona: { label: "Persona × phase", keys: ["Persona", "Phase", "Opt. Event"] },
  angle: { label: "Angle", keys: ["Persona", "Angle"] },
} as const
type GroupKey = keyof typeof GROUPS

const SUMS = [
  "Spend ($)", "Impressions", "Clicks", "Link Clicks", "Results (Opt. Event)", "Sessions (GA4)", "Engaged Sessions (GA4)",
  "View Listing (GA4)", "Begin Checkout (GA4)", "Purchases (GA4)", "become_host_click (GA4)", "host_onboarding_started (GA4)",
  "host_first_listing_created (GA4)", "Bookings (thrml)", "Booking Revenue (thrml)", "Revenue (GA4)", "Revenue (platform)",
] as const

const PRESETS = [7, 14, 30, 45, 90] as const

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (n: number) => Math.round(n).toLocaleString()
const div = (a: number, b: number) => (b > 0 ? a / b : null)

export function PerformanceClient() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(daysAgo(0))
  const [test, setTest] = useState(false)
  const [group, setGroup] = useState<GroupKey>("campaign")
  const [platform, setPlatform] = useState("")
  const [persona, setPersona] = useState("")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedQs, setLoadedQs] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const qs = useMemo(() => new URLSearchParams({ from, to, ...(test ? { test: "1" } : {}) }).toString(), [from, to, test])
  const loading = loadedQs !== `${qs}#${reloadTick}`

  useEffect(() => {
    let cancelled = false
    const key = `${qs}#${reloadTick}`
    fetch(`/api/admin/reporting/rows?${qs}`, { credentials: "include" })
      .then(async (r) => {
        const data = (await r.json()) as { rows?: Row[]; error?: string }
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
        if (!cancelled) {
          setRows(data.rows ?? [])
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoadedQs(key)
      })
    return () => {
      cancelled = true
    }
  }, [qs, reloadTick])
  const load = useCallback(() => setReloadTick((t) => t + 1), [])

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (!platform || r.Platform === platform) && (!persona || String(r.Persona).toLowerCase() === persona)
      ),
    [rows, platform, persona]
  )

  const table = useMemo(() => {
    const keys = GROUPS[group].keys as readonly string[]
    const m = new Map<string, { dims: string[]; sums: Record<string, number> }>()
    for (const r of filtered) {
      const dims = keys.map((k) => String(r[k] ?? ""))
      const k = dims.join("|")
      const cur = m.get(k) ?? { dims, sums: Object.fromEntries(SUMS.map((s) => [s, 0])) }
      for (const s of SUMS) cur.sums[s] += Number(r[s]) || 0
      m.set(k, cur)
    }
    const out = [...m.values()]
    out.sort((a, b) => (group === "day" || group === "week" ? b.dims[0]!.localeCompare(a.dims[0]!) : b.sums["Spend ($)"]! - a.sums["Spend ($)"]!))
    return { keys, rows: out }
  }, [filtered, group])

  const totals = useMemo(() => {
    const t: Record<string, number> = Object.fromEntries(SUMS.map((s) => [s, 0]))
    for (const r of filtered) for (const s of SUMS) t[s] += Number(r[s]) || 0
    return t
  }, [filtered])

  const refresh = async () => {
    setRefreshing("Pulling 45 days from Meta, Google Ads and GA4…")
    try {
      const r = await fetch("/api/admin/reporting/refresh", { method: "POST", credentials: "include" })
      const d = (await r.json()) as { rows?: number; sheets?: string[]; errors?: string[]; error?: string }
      setRefreshing(
        d.error
          ? `Refresh failed: ${d.error}`
          : `Refreshed ${d.rows ?? 0} rows → ${(d.sheets ?? []).join(", ") || "no sheets"}${d.errors?.length ? `. Issues: ${d.errors.join(" | ")}` : ""}`
      )
      void load()
    } catch (e) {
      setRefreshing(e instanceof Error ? e.message : "Refresh failed")
    }
  }

  const exportHref = (tab: string) => `/api/admin/reporting/rows?${qs}&format=csv&tab=${tab}`
  const select = "rounded-lg border border-[#DCCDBA] bg-white px-2.5 py-1.5 text-sm text-[#2A2118]"

  const kpis = [
    ["Spend", money(totals["Spend ($)"]!)],
    ["Results", int(totals["Results (Opt. Event)"]!)],
    ["Cost / result", div(totals["Spend ($)"]!, totals["Results (Opt. Event)"]!)],
    ["Sessions (GA4)", int(totals["Sessions (GA4)"]!)],
    ["Cost / session", div(totals["Spend ($)"]!, totals["Sessions (GA4)"]!)],
    ["Bookings (thrml)", int(totals["Bookings (thrml)"]!)],
    ["ROAS (thrml)", div(totals["Booking Revenue (thrml)"]!, totals["Spend ($)"]!)],
    ["ROAS (GA4)", div(totals["Revenue (GA4)"]!, totals["Spend ($)"]!)],
  ] as const

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E7DACA] bg-[#FCFAF7] p-4">
        <div className="flex gap-1">
          {PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setFrom(daysAgo(d))
                setTo(daysAgo(0))
              }}
              className={`rounded-full border px-2.5 py-1 text-xs ${from === daysAgo(d) && to === daysAgo(0) ? "border-[#9A4A33] bg-[#9A4A33] text-white" : "border-[#DCCDBA] bg-white text-[#2A2118]"}`}
            >
              {d}d
            </button>
          ))}
        </div>
        <label className="text-xs text-[#6E5B49]">
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={select} />
        </label>
        <label className="text-xs text-[#6E5B49]">
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={select} />
        </label>
        <label className="text-xs text-[#6E5B49]">
          Group by{" "}
          <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)} className={select}>
            {Object.entries(GROUPS).map(([k, g]) => (
              <option key={k} value={k}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={select} aria-label="Platform">
          <option value="">All platforms</option>
          <option value="Meta">Meta</option>
          <option value="Google Ads">Google Ads</option>
        </select>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} className={select} aria-label="Persona">
          <option value="">Hosts + guests</option>
          <option value="host">Hosts</option>
          <option value="guest">Guests</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#6E5B49]">
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Test data
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <a href={exportHref("cleaned")} className="rounded-lg border border-[#9A4A33] px-3 py-1.5 text-sm font-medium text-[#9A4A33] hover:bg-[#F9E5DD]">
            Export CSV
          </a>
          <a href={exportHref("lookup")} className="rounded-lg border border-[#DCCDBA] px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]">
            Lookup CSV
          </a>
          <a href={exportHref("ga4")} className="rounded-lg border border-[#DCCDBA] px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]">
            GA4 CSV
          </a>
          {!test ? (
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={Boolean(refreshing?.endsWith("…"))}>
              Refresh now
            </Button>
          ) : null}
        </div>
      </div>

      {refreshing ? <p className="text-xs text-[#6E5B49]">{refreshing}</p> : null}
      {error ? <div className="rounded-xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map(([label, v]) => (
          <div key={label} className="rounded-xl border border-[#E7DACA] bg-white px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-[#6E5B49]">{label}</p>
            <p className="mt-0.5 text-lg font-semibold text-[#2A2118]">
              {v === null ? "—" : typeof v === "number" ? (label.startsWith("ROAS") ? `${v.toFixed(2)}×` : money(v)) : v}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#E7DACA] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F5F0EA] text-left text-[11px] uppercase tracking-wide text-[#6E5B49]">
            <tr>
              {table.keys.map((k) => (
                <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">
                  {k}
                </th>
              ))}
              {["Spend", "Impr.", "CTR", "Results", "Cost/result", "Sessions", "Cost/session", "Views", "Checkouts", "Bookings", "ROAS thrml", "ROAS GA4"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE6DA]">
            {loading && !rows ? (
              <tr>
                <td className="px-3 py-6 text-[#6E5B49]" colSpan={20}>
                  Loading…
                </td>
              </tr>
            ) : table.rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#6E5B49]" colSpan={20}>
                  No delivery in this range{test ? " (run the test scenario on the Evaluator tab)" : ""}.
                </td>
              </tr>
            ) : (
              table.rows.map((r) => {
                const s = r.sums
                const ctr = div(s.Clicks!, s.Impressions!)
                const cpr = div(s["Spend ($)"]!, s["Results (Opt. Event)"]!)
                const cps = div(s["Spend ($)"]!, s["Sessions (GA4)"]!)
                const roasT = div(s["Booking Revenue (thrml)"]!, s["Spend ($)"]!)
                const roasG = div(s["Revenue (GA4)"]!, s["Spend ($)"]!)
                return (
                  <tr key={r.dims.join("|")} className="hover:bg-[#FBF8F4]">
                    {r.dims.map((d, i) => (
                      <td key={i} className="max-w-[260px] truncate whitespace-nowrap px-3 py-2 text-[#2A2118]" title={d}>
                        {d || "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{money(s["Spend ($)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s.Impressions!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ctr === null ? "—" : `${(ctr * 100).toFixed(2)}%`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s["Results (Opt. Event)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cpr === null ? "—" : money(cpr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s["Sessions (GA4)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cps === null ? "—" : money(cps)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s["View Listing (GA4)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s["Begin Checkout (GA4)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(s["Bookings (thrml)"]!)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{roasT === null ? "—" : `${roasT.toFixed(2)}×`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{roasG === null ? "—" : `${roasG.toFixed(2)}×`}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#6E5B49]">
        Results = the row&apos;s optimization event as the platform reports it. ROAS thrml uses bookings stamped with the ad
        ID at checkout; GA4 and platform ROAS use their own attribution. Exports include every column.
      </p>
    </div>
  )
}
