"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"

import { toggleRuleActive, updateRuleValue, type RulesActionResult } from "./actions"

export type RuleConfigRow = {
  id: number
  scope: string
  rule_key: string
  rule_value: unknown
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type RuleGroup = { scope: string; rules: RuleConfigRow[] }

function parseLocal(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw
  if (typeof raw === "object") return raw
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return raw
    }
  }
  return raw
}

function valueToEditString(raw: unknown): string {
  const v = parseLocal(raw)
  if (v === null || v === undefined) return ""
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return JSON.stringify(v)
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function formatRuleValue(raw: unknown): ReactNode {
  const v = parseLocal(raw)
  if (v === null || v === undefined) return <span className="text-[#6E5B49]">—</span>
  if (typeof v === "boolean") return <span>{v ? "true" : "false"}</span>
  if (typeof v === "number") return <span className="font-mono">{v}</span>
  if (typeof v === "string") return <span className="text-[#2A2118]">{v}</span>
  if (Array.isArray(v))
    return <span className="text-sm text-[#2A2118]">{v.map((x) => String(x)).join(", ")}</span>
  return (
    <pre className="max-h-40 overflow-auto rounded border border-[#E7DACA] bg-[#1A1410]/[0.03] p-2 font-mono text-xs text-[#2A2118]">
      {JSON.stringify(v, null, 2)}
    </pre>
  )
}

function tryParseInput(input: string): unknown {
  const t = input.trim()
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t) as unknown
  if (t === "true" || t === "false") return t === "true"
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (t.startsWith('"') && t.endsWith('"')) return JSON.parse(t) as unknown
  return t
}

export function RulesEditorClient({ groups }: { groups: RuleGroup[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [edit, setEdit] = useState<RuleConfigRow | null>(null)
  const [draft, setDraft] = useState("")

  const openEdit = (r: RuleConfigRow) => {
    setMsg(null)
    setEdit(r)
    setDraft(valueToEditString(r.rule_value))
  }

  const save = () => {
    if (!edit) return
    setMsg(null)
    let neu: unknown
    try {
      neu = tryParseInput(draft)
    } catch {
      setMsg("Could not parse value.")
      return
    }
    const old = parseLocal(edit.rule_value)
    if (typeof old === "number" && typeof neu === "number" && old > 0) {
      const ratio = neu >= old ? neu / old : old / neu
      if (ratio >= 10 && !window.confirm("This change is ≥10× the current value. Save anyway?")) return
    }

    start(async () => {
      const res: RulesActionResult = await updateRuleValue(edit.id, draft)
      if (!res.ok) {
        setMsg(res.error)
        return
      }
      setEdit(null)
      router.refresh()
    })
  }

  const onToggle = (r: RuleConfigRow, active: boolean) => {
    setMsg(null)
    start(async () => {
      const res = await toggleRuleActive(r.id, active)
      if (!res.ok) {
        setMsg(res.error)
        return
      }
      router.refresh()
    })
  }

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.scope.localeCompare(b.scope)), [groups])

  return (
    <div className="space-y-4">
      {msg ? (
        <div className="rounded-2xl border border-[#C75B3A]/40 bg-[#F9E5DD] px-4 py-3 text-sm text-[#2A2118]">{msg}</div>
      ) : null}

      {sortedGroups.map(({ scope, rules }) => (
        <details key={scope} className="rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3]">
          <summary className="cursor-pointer px-4 py-3 font-serif text-lg text-[#2A2118] marker:text-[#9A4A33]">
            {scope} <span className="text-xs font-normal text-[#6E5B49]">({rules.length} rules)</span>
          </summary>
          <div className="space-y-3 border-t border-[#E7DACA] px-4 pb-4 pt-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-[#E7DACA] bg-white/80 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-mono text-sm font-semibold text-[#2A2118]">{r.rule_key}</p>
                    {r.description ? <p className="text-sm text-[#6E5B49]">{r.description}</p> : null}
                    <div className="pt-1 text-sm">
                      <span className="text-[#6E5B49]">Value: </span>
                      {formatRuleValue(r.rule_value)}
                    </div>
                    <p className="text-xs text-[#8B7562]">
                      Updated {new Date(r.updated_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                      {r.updated_by ? ` · ${r.updated_by}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <label className="flex items-center gap-2 text-xs text-[#6E5B49]">
                      <span>Active</span>
                      <Switch
                        checked={r.active}
                        disabled={pending}
                        onCheckedChange={(v) => onToggle(r, v)}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#DCCDBA] text-[#2A2118]"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}

      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent side="right" className="w-full max-w-md border-[#E7DACA] bg-[#FCFAF7] sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-serif text-[#2A2118]">Edit rule</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {edit ? `${edit.scope} · ${edit.rule_key}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-4">
            <label className="text-xs font-medium text-[#6E5B49]" htmlFor="rule-value">
              Value (JSON for objects/arrays; plain number or quoted string otherwise)
            </label>
            <textarea
              id="rule-value"
              className="min-h-[200px] w-full rounded-md border border-[#DCCDBA] bg-white p-3 font-mono text-sm text-[#1A1410]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <SheetFooter className="gap-2 border-t border-[#E7DACA]">
            <Button type="button" variant="outline" className="border-[#DCCDBA]" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
              disabled={pending}
              onClick={() => save()}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
