"use client"

import { useMemo, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import type { EditableTag, LibraryItem } from "@/lib/creative/library"

import { reorganizeCreativeFiles, saveCreativeTags } from "./actions"

const FILTERS: Array<{ key: keyof LibraryItem; label: string }> = [
  { key: "year", label: "Year" },
  { key: "persona", label: "Persona" },
  { key: "angle", label: "Angle" },
  { key: "theme", label: "Theme" },
  { key: "cta", label: "CTA" },
  { key: "geo", label: "Geo" },
  { key: "service", label: "Service" },
  { key: "format", label: "Size" },
  { key: "status", label: "Status" },
]

const EDIT_FIELDS: Array<{ key: EditableTag; label: string; placeholder: string }> = [
  { key: "theme", label: "Theme", placeholder: "e.g. winter, launch" },
  { key: "geo", label: "Geo", placeholder: "e.g. SEA" },
  { key: "service", label: "Service", placeholder: "sauna, coldplunge…" },
  { key: "persona", label: "Persona", placeholder: "host / guest" },
  { key: "angle", label: "Angle", placeholder: "pov_earnings" },
  { key: "cta", label: "CTA", placeholder: "list_now" },
]

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const label = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v))

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function CreativeLibraryClient({ items, needsReorganize }: { items: LibraryItem[]; needsReorganize: boolean }) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const options = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const f of FILTERS) {
      out[f.key] = [...new Set(items.map((i) => i[f.key]).filter((v) => v !== null && v !== "").map(String))].sort()
    }
    return out
  }, [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      for (const [k, v] of Object.entries(filters)) {
        if (v && String(i[k as keyof LibraryItem] ?? "") !== v) return false
      }
      if (q) {
        const hay = [i.name, i.hook, i.template, i.folder, ...i.tags].join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filters, search])

  const exportCsv = () => {
    const header = ["Name", "Year", "Persona", "Angle", "Theme", "CTA", "Geo", "Service", "Size", "Status", "Ad", "Hook", "Template", "Folder", "GCS Path", "Spend", "Impressions", "Clicks", "Created"]
    const lines = visible.map((i) =>
      [i.name, i.year, i.persona, i.angle, i.theme, i.cta, i.geo, i.service, i.format, i.status, i.adLegacyId, i.hook, i.template, i.folder, i.gcsPath, i.performance?.spend, i.performance?.impressions, i.performance?.clicks, i.createdAt.slice(0, 10)]
        .map(csvCell)
        .join(",")
    )
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `thrml_creative_library_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const startEdit = (i: LibraryItem) => {
    setEditing(i.id)
    setDraft({
      theme: i.theme ?? "",
      geo: i.geo ?? "",
      service: i.service ?? "",
      persona: i.persona ?? "",
      angle: i.angle ?? "",
      cta: i.cta ?? "",
      tags: i.tags.join(", "),
    })
  }

  const save = (id: string) => {
    const { tags, ...rest } = draft
    startTransition(async () => {
      const res = await saveCreativeTags(id, { ...rest, tags: (tags ?? "").split(",") })
      setMessage(res.ok ? "Saved." : `Couldn't save: ${res.error}`)
      if (res.ok) setEditing(null)
    })
  }

  const reorganize = () => {
    startTransition(async () => {
      setMessage("Moving files…")
      const res = await reorganizeCreativeFiles()
      setMessage(
        res.ok
          ? `Done: ${res.moved} moved, ${res.alreadyInPlace} already in place${res.failed.length ? `, ${res.failed.length} failed (${res.failed[0]!.error})` : ""}. Originals were kept.`
          : `Couldn't reorganize: ${res.error}`
      )
    })
  }

  return (
    <div className="space-y-5">
      {needsReorganize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E7DACA] bg-[#FFF8F1] p-4 text-sm text-[#5D4E42]">
          <span>Some files are still in the old year/month folders. Copy them into the new layout (originals are kept).</span>
          <Button size="sm" disabled={pending} onClick={reorganize}>
            Reorganize files
          </Button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-[#6E5B49]">{message}</p> : null}

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#E7DACA] bg-white p-4">
        <label className="flex min-w-[180px] flex-1 flex-col text-xs text-[#6E5B49]">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad name, hook, tag…"
            className="mt-1 rounded-lg border border-[#E7DACA] px-2 py-1.5 text-sm text-[#2A2118]"
          />
        </label>
        {FILTERS.map((f) => (
          <label key={f.key} className="flex flex-col text-xs text-[#6E5B49]">
            {f.label}
            <select
              value={filters[f.key] ?? ""}
              onChange={(e) => setFilters((cur) => ({ ...cur, [f.key]: e.target.value }))}
              className="mt-1 rounded-lg border border-[#E7DACA] px-2 py-1.5 text-sm text-[#2A2118]"
            >
              <option value="">All</option>
              {(options[f.key] ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button variant="outline" size="sm" onClick={() => { setFilters({}); setSearch("") }}>
          Clear
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visible.length}>
          Export CSV
        </Button>
      </div>

      <p className="text-sm text-[#6E5B49]">
        {visible.length} of {items.length} creatives
      </p>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#E7DACA] p-8 text-center text-sm text-[#6E5B49]">
          No creatives match these filters.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((i) => (
            <div key={i.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#E7DACA] bg-white">
              <div className="flex aspect-square items-center justify-center bg-[#F7F3EE]">
                {i.previewUrl ? (
                  i.assetType === "video" ? (
                    <video src={i.previewUrl} className="h-full w-full object-contain" muted controls preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.previewUrl} alt={i.name} className="h-full w-full object-contain" loading="lazy" />
                  )
                ) : (
                  <span className="text-xs text-[#9C8B7C]">No preview</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3 text-xs text-[#5D4E42]">
                <p className="break-all font-mono text-[11px] text-[#2A2118]">{i.name}</p>
                {i.hook ? <p className="italic">“{i.hook}”</p> : null}
                <div className="flex flex-wrap gap-1">
                  {[i.year, i.persona, i.angle, i.theme, i.cta, i.geo, i.service, i.format, i.status, ...i.tags]
                    .filter(Boolean)
                    .map((t, idx) => (
                      <span key={`${t}-${idx}`} className="rounded-full bg-[#F3E8DE] px-2 py-0.5 text-[10px] text-[#8B4E39]">
                        {t}
                      </span>
                    ))}
                </div>
                {i.performance ? (
                  <p>
                    {money(i.performance.spend)} · {i.performance.impressions.toLocaleString()} impr ·{" "}
                    {i.performance.clicks.toLocaleString()} clicks
                  </p>
                ) : (
                  <p className="text-[#9C8B7C]">{i.adLegacyId ? `${i.adLegacyId} · not live yet` : "Not linked to an ad"}</p>
                )}
                <p className="break-all text-[10px] text-[#9C8B7C]">{label(i.folder)}</p>

                {editing === i.id ? (
                  <div className="mt-1 space-y-1.5">
                    {EDIT_FIELDS.map((f) => (
                      <label key={f.key} className="flex items-center gap-2">
                        <span className="w-14 shrink-0">{f.label}</span>
                        <input
                          value={draft[f.key] ?? ""}
                          placeholder={f.placeholder}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                          className="min-w-0 flex-1 rounded-md border border-[#E7DACA] px-2 py-1 text-xs"
                        />
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <span className="w-14 shrink-0">Tags</span>
                      <input
                        value={draft.tags ?? ""}
                        placeholder="comma separated"
                        onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-[#E7DACA] px-2 py-1 text-xs"
                      />
                    </label>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={pending} onClick={() => save(i.id)}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(i)}>
                      Edit tags
                    </Button>
                    {i.previewUrl ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href={i.previewUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
