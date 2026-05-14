"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/admin-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import type { RecKindT } from "@/types/paid-media"

export type RulesActionResult = { ok: true } | { ok: false; error: string }

const LOG_KIND = "AGENT_RUN" as RecKindT

function isNumericRuleKey(key: string): boolean {
  return /(_usd|_pct|_days|_hours|_threshold|_cap|_per_week|_floor|threshold)$/i.test(key)
}

function parseStoredValue(raw: unknown): unknown {
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

function validateParsedValue(ruleKey: string, parsed: unknown): string | null {
  if (ruleKey === "approval_mode") {
    const v = typeof parsed === "string" ? parsed : String(parsed)
    if (v !== "ALL_REQUIRE_APPROVAL" && v !== "AUTO_APPROVE_LOW_STAKES") {
      return "approval_mode must be ALL_REQUIRE_APPROVAL or AUTO_APPROVE_LOW_STAKES."
    }
    return null
  }
  if (ruleKey === "primary_kpi") {
    if (typeof parsed !== "string" || !parsed.length) return "primary_kpi must be a non-empty string (JSON-encoded)."
    return null
  }
  if (ruleKey === "requires_human_kinds") {
    if (!Array.isArray(parsed)) return "requires_human_kinds must be a JSON array."
    return null
  }
  if (ruleKey === "pause_under_perf_threshold") {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "pause_under_perf_threshold must be a JSON object."
    }
    return null
  }
  if (typeof parsed === "number" && (!Number.isFinite(parsed) || parsed <= 0)) {
    return "Numeric rule values must be finite and greater than zero."
  }
  if (isNumericRuleKey(ruleKey) && typeof parsed !== "number") {
    return "This rule key expects a numeric value."
  }
  return null
}

function coerceInputToJsonValue(ruleKey: string, input: string): unknown {
  const trimmed = input.trim()
  if (ruleKey === "pause_under_perf_threshold" || ruleKey === "requires_human_kinds") {
    return JSON.parse(trimmed) as unknown
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown
  }
  if (trimmed === "true" || trimmed === "false") return trimmed === "true"
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isFinite(n)) return n
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return JSON.parse(trimmed.startsWith("'") ? `"${trimmed.slice(1, -1).replace(/"/g, '\\"')}"` : trimmed) as unknown
  }
  return trimmed
}

export async function updateRuleValue(id: number, input: string): Promise<RulesActionResult> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const email = user.email?.trim() || user.id

  const { data: row, error: fetchErr } = await admin.from("rules_config").select("*").eq("id", id).maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!row) return { ok: false, error: "Rule not found." }

  const ruleKey = String(row.rule_key)
  const scope = String(row.scope)
  let parsed: unknown
  try {
    parsed = coerceInputToJsonValue(ruleKey, input)
  } catch {
    return { ok: false, error: "Invalid JSON or format." }
  }

  const err = validateParsedValue(ruleKey, parsed)
  if (err) return { ok: false, error: err }

  const oldVal = parseStoredValue(row.rule_value)

  const { error: upErr } = await admin
    .from("rules_config")
    .update({
      rule_value: parsed as never,
      updated_at: new Date().toISOString(),
      updated_by: email,
    })
    .eq("id", id)

  if (upErr) return { ok: false, error: upErr.message }

  try {
    await admin.from("actions_log").insert({
      recommendation_id: null,
      kind: LOG_KIND,
      executed_by: "HUMAN",
      target_campaign_id: null,
      target_ad_set_id: null,
      target_ad_id: null,
      payload: {
        event: "rule_updated",
        rule_id: id,
        rule_key: ruleKey,
        scope,
        old_value: oldVal,
        new_value: parsed,
      },
      success: true,
      error_message: null,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log action." }
  }

  revalidatePath("/admin/paid-media/rules")
  revalidatePath("/admin/paid-media")
  return { ok: true }
}

export async function toggleRuleActive(id: number, active: boolean): Promise<RulesActionResult> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const email = user.email?.trim() || user.id

  const { data: row, error: fetchErr } = await admin.from("rules_config").select("*").eq("id", id).maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!row) return { ok: false, error: "Rule not found." }

  const oldActive = Boolean(row.active)

  const { error: upErr } = await admin
    .from("rules_config")
    .update({
      active,
      updated_at: new Date().toISOString(),
      updated_by: email,
    })
    .eq("id", id)

  if (upErr) return { ok: false, error: upErr.message }

  try {
    await admin.from("actions_log").insert({
      recommendation_id: null,
      kind: LOG_KIND,
      executed_by: "HUMAN",
      target_campaign_id: null,
      target_ad_set_id: null,
      target_ad_id: null,
      payload: {
        event: "rule_active_toggled",
        rule_id: id,
        rule_key: row.rule_key,
        scope: row.scope,
        old_active: oldActive,
        new_active: active,
      },
      success: true,
      error_message: null,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log action." }
  }

  revalidatePath("/admin/paid-media/rules")
  return { ok: true }
}
