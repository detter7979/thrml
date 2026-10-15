import type { SupabaseClient } from "@supabase/supabase-js"

import { META_GRAPH_BASE, getMetaMarketingApiToken } from "@/lib/agent/meta-api"

/**
 * Keep campaigns / ad_sets / ads statuses in line with what is actually running in Meta.
 *
 * The rules engine only looks at TEST/SCALE rows, so a row that says TEST while Meta has it
 * paused makes the dashboard (and the evaluator) think it is live. Meta is the source of truth
 * for whether something delivers; this only moves rows between "live" (TEST/SCALE), PAUSED and
 * ARCHIVED, and never touches DRAFT or KILLED rows or our TEST-vs-SCALE phase choice.
 */

type Level = "campaigns" | "ad_sets" | "ads"
const ID_COLUMN: Record<Level, string> = {
  campaigns: "platform_campaign_id",
  ad_sets: "platform_adset_id",
  ads: "platform_ad_id",
}

const LIVE = new Set(["TEST", "SCALE"])
const PAUSED_META = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "AD_PAUSED"])
const GONE_META = new Set(["DELETED", "ARCHIVED"])

export type StatusChange = { level: Level; id: string; name: string; from: string; to: string; metaStatus: string }
export type StatusSyncResult = {
  checked: number
  changes: StatusChange[]
  notFound: { level: Level; id: string; name: string }[]
  dryRun: boolean
}

/** Pure mapping, exported for tests. Returns the new DB status, or null for "leave as is". */
export function nextStatus(dbStatus: string, metaStatus: string): string | null {
  if (dbStatus === "DRAFT" || dbStatus === "KILLED" || dbStatus === "ARCHIVED") return null
  if (GONE_META.has(metaStatus)) return "ARCHIVED"
  if (PAUSED_META.has(metaStatus)) return LIVE.has(dbStatus) ? "PAUSED" : null
  if (metaStatus === "ACTIVE") return dbStatus === "PAUSED" ? "TEST" : null
  // IN_PROCESS, WITH_ISSUES, PENDING_REVIEW, DISAPPROVED, etc.: leave for a human.
  return null
}

async function fetchStatuses(ids: string[]): Promise<Map<string, string>> {
  const token = getMetaMarketingApiToken()
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const url = `${META_GRAPH_BASE}/?ids=${batch.join(",")}&fields=effective_status,status&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url)
    const json = (await res.json().catch(() => null)) as
      | Record<string, { effective_status?: string; status?: string }>
      | { error?: { message?: string } }
      | null
    if (!res.ok) {
      // A batch fails as a whole if any id is unknown; fall back to one call per id.
      if (batch.length > 1) {
        for (const id of batch) {
          const single = await fetchStatuses([id]).catch(() => new Map<string, string>())
          single.forEach((v, k) => out.set(k, v))
        }
        continue
      }
      const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
      if (/does not exist|Unsupported get request|cannot be loaded/i.test(msg)) continue
      throw new Error(`Meta status lookup failed: ${msg}`)
    }
    for (const [id, v] of Object.entries((json ?? {}) as Record<string, { effective_status?: string; status?: string }>)) {
      const s = v.effective_status ?? v.status
      if (s) out.set(id, s)
    }
  }
  return out
}

export async function syncMetaStatuses(admin: SupabaseClient, opts: { dryRun?: boolean } = {}): Promise<StatusSyncResult> {
  const result: StatusSyncResult = { checked: 0, changes: [], notFound: [], dryRun: Boolean(opts.dryRun) }

  for (const level of ["campaigns", "ad_sets", "ads"] as Level[]) {
    const col = ID_COLUMN[level]
    const { data, error } = await admin
      .from(level)
      .select(`id, name, status, ${col}`)
      .not(col, "is", null)
      .in("status", ["TEST", "SCALE", "PAUSED"])
    if (error) throw new Error(`${level}: ${error.message}`)
    const rows = (data ?? []) as unknown as Array<Record<string, string>>
    if (!rows.length) continue

    const statuses = await fetchStatuses(rows.map((r) => r[col]))
    const now = new Date().toISOString()
    for (const row of rows) {
      result.checked++
      const metaStatus = statuses.get(row[col])
      if (!metaStatus) {
        result.notFound.push({ level, id: row.id, name: row.name })
        continue
      }
      const to = nextStatus(row.status, metaStatus)
      if (!to || to === row.status) continue
      result.changes.push({ level, id: row.id, name: row.name, from: row.status, to, metaStatus })
      if (!opts.dryRun) {
        const patch: Record<string, unknown> = { status: to, updated_at: now }
        if (to === "PAUSED") patch.paused_at = now
        if (to === "TEST") patch.paused_at = null
        const { error: upErr } = await admin.from(level).update(patch).eq("id", row.id)
        if (upErr) throw new Error(`${level} ${row.id}: ${upErr.message}`)
      }
    }
  }

  if (!opts.dryRun && result.changes.length) {
    await admin.from("actions_log").insert({
      kind: "SYSTEM",
      executed_by: "SYSTEM",
      payload: { run_type: "meta_status_sync", changes: result.changes, not_found: result.notFound.length },
      success: true,
    })
  }
  return result
}
