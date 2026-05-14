import { requireAdmin } from "@/lib/admin-guard"

import type { RuleConfigRow, RuleGroup } from "./rules-editor-client"
import { RulesEditorClient } from "./rules-editor-client"

export const dynamic = "force-dynamic"

export default async function PaidMediaRulesPage() {
  const { admin } = await requireAdmin()

  const { data: rows, error } = await admin
    .from("rules_config")
    .select("id, scope, rule_key, rule_value, description, active, created_at, updated_at, updated_by")
    .order("scope", { ascending: true })
    .order("rule_key", { ascending: true })

  if (error) {
    return (
      <div className="px-6 py-8">
        <h1 className="font-serif text-3xl text-[#2A2118]">Rules</h1>
        <p className="mt-4 text-sm text-[#9A4A33]">Could not load rules_config: {error.message}</p>
      </div>
    )
  }

  const list = (rows ?? []) as RuleConfigRow[]
  const byScope = new Map<string, RuleConfigRow[]>()
  for (const r of list) {
    const arr = byScope.get(r.scope) ?? []
    arr.push(r)
    byScope.set(r.scope, arr)
  }
  const groups: RuleGroup[] = [...byScope.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([scope, rules]) => ({ scope, rules }))

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl text-[#2A2118]">Rules</h1>
        <p className="mt-1 text-sm text-[#6E5B49]">
          Paid media thresholds (<code className="font-mono text-xs">rules_config</code>). Changes are audited in{" "}
          <code className="font-mono text-xs">actions_log</code>.
        </p>
      </div>

      <RulesEditorClient groups={groups} />
    </div>
  )
}
