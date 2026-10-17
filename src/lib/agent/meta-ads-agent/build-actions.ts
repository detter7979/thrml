/**
 * "Build" executions — run only after a human approves the recommendation (never auto-approved):
 *
 * - CREATE_AD_SET (rule 10, audience test): copy the campaign's best ad set (with its ads) into the
 *   same campaign, swap in the targeting of an audience that already exists in another ad set, name
 *   it with the next builder ID and add the row to the namer Ad Set Builder. Created PAUSED.
 * - ADVANCE_PHASE (rule 05): create the next-phase campaign from the namer (e.g. C004 for sauna P2)
 *   in Meta, copy the source campaign's best ad set into it and switch its optimization to the
 *   next-phase custom conversion (HO / NL). Created PAUSED.
 *
 * Nothing here turns anything on: you review in Ads Manager and flip it live.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { META_GRAPH_BASE, getMetaAdAccountId, getMetaMarketingApiToken } from "@/lib/agent/meta-api"
import { fetchCustomConversionEventMap } from "@/lib/agent/meta-ads-api"
import {
  batchWriteCells,
  createGoogleSheetsClient,
  getNamerSheetId,
  columnToLetter,
  readSheetValues,
  resolveTabTitle,
  listSpreadsheetTabs,
} from "@/lib/agent/google-sheets-client"
import { NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"
import type { Recommendation } from "@/types/paid-media"

import type { ExecutorResult } from "./types"

type Json = Record<string, unknown>

function effectivePayload(rec: Recommendation): Json {
  return rec.modified_payload && typeof rec.modified_payload === "object"
    ? (rec.modified_payload as Json)
    : (rec.payload as Json)
}

async function graph(method: "GET" | "POST", path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ access_token: getMetaMarketingApiToken(), ...params })
  const url = `${META_GRAPH_BASE}/${path}?${method === "GET" ? qs.toString() : `access_token=${encodeURIComponent(getMetaMarketingApiToken())}`}`
  const res = await fetch(url, method === "GET" ? undefined : { method: "POST", body: new URLSearchParams(params) })
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg = (body as { error?: { error_user_msg?: string; message?: string } })?.error
    throw new Error(`Meta ${method} ${path.split("?")[0]}: ${msg?.error_user_msg || msg?.message || text.slice(0, 300)}`)
  }
  return body as Json
}

/** Best live ad set in a campaign by cost per result (campaign event) over 14 days; falls back to most spend. */
async function bestAdSet(admin: SupabaseClient, campaignId: string, event: string) {
  const { data: sets } = await admin
    .from("ad_sets")
    .select("id, legacy_id, name, audience_src, placement, platform_adset_id, status")
    .eq("campaign_id", campaignId)
    .not("platform_adset_id", "is", null)
  const live = (sets ?? []).filter((s) => s.status === "TEST" || s.status === "SCALE")
  const pool = live.length ? live : sets ?? []
  if (!pool.length) return null
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const { data: perf } = await admin
    .from("performance_daily")
    .select("entity_id, spend_usd, conversions, conv_event")
    .eq("level", "ad_set")
    .in("entity_id", pool.map((s) => s.id))
    .gte("date", since)
  const stats = new Map<string, { spend: number; conv: number }>()
  for (const r of perf ?? []) {
    const s = stats.get(r.entity_id as string) ?? { spend: 0, conv: 0 }
    s.spend += Number(r.spend_usd) || 0
    if (r.conv_event === event) s.conv += Number(r.conversions) || 0
    stats.set(r.entity_id as string, s)
  }
  const ranked = [...pool].sort((a, b) => {
    const sa = stats.get(a.id) ?? { spend: 0, conv: 0 }
    const sb = stats.get(b.id) ?? { spend: 0, conv: 0 }
    const cprA = sa.conv > 0 ? sa.spend / sa.conv : Infinity
    const cprB = sb.conv > 0 ? sb.spend / sb.conv : Infinity
    return cprA !== cprB ? cprA - cprB : sb.spend - sa.spend
  })
  return ranked[0]!
}

/** Copy an ad set (with ads) into a campaign, paused. Returns the new ad set id. */
async function copyAdSet(sourceAdSetId: string, targetCampaignId: string): Promise<string> {
  const res = await graph("POST", `${sourceAdSetId}/copies`, {
    campaign_id: targetCampaignId,
    deep_copy: "true",
    status_option: "PAUSED",
    rename_options: JSON.stringify({ rename_strategy: "NO_RENAME" }),
  })
  const id = (res.copied_adset_id ?? (res as { id?: string }).id) as string | undefined
  if (!id) throw new Error(`Meta ad set copy returned no id: ${JSON.stringify(res).slice(0, 200)}`)
  return String(id)
}

async function adSetMeta(id: string) {
  return graph("GET", id, { fields: "name,targeting,promoted_object,daily_budget,optimization_goal" })
}

/**
 * Append an Ad Set Builder row for the new ad set. The source ad set's row is the template (same
 * campaign, so Space Type / Platform Campaign ID / formulas carry over); the audience columns come
 * from the ad set whose audience is being tested. Columns are found by header, not position.
 */
async function appendAdSetBuilderRow(row: {
  sourceLegacyId: string
  audienceFromLegacyId: string
  status: string
  notes: string
  platformAdSetId: string
}): Promise<{ legacyId: string; name: string | null }> {
  const sheets = createGoogleSheetsClient()
  const sheetId = getNamerSheetId()
  const tab = resolveTabTitle(await listSpreadsheetTabs(sheets, sheetId), ...NAMER_TAB_CANDIDATES.ad_set)
  if (!tab) throw new Error("Ad Set Builder tab not found in the namer sheet")
  const esc = tab.replace(/'/g, "''")
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${esc}'`,
    valueRenderOption: "FORMULA",
  })
  const values = (res.data.values ?? []) as unknown[][]
  const cell = (r: unknown[] | undefined, i: number) => (r && r[i] != null ? String(r[i]) : "")

  const headerIdx = values.findIndex((r) => r.some((c) => /^ad set id$/i.test(String(c ?? "").trim())))
  if (headerIdx < 0) throw new Error("Ad Set Builder header row not found")
  const header = values[headerIdx]!.map((c) => String(c ?? "").trim().toLowerCase())
  const col = (re: RegExp) => header.findIndex((h) => re.test(h))
  const cId = col(/^ad set id$/)
  const cPlatform = col(/^platform ad ?set id/)
  const cStatus = col(/^status/)
  const cNotes = col(/^notes/)
  const cName = col(/ad set name/)
  const audienceCols = [col(/^audience src/), col(/^placement/), col(/^audience details/)].filter((i) => i >= 0)

  let maxId = 0
  let lastRow = headerIdx + 1
  let srcRowIdx = -1
  let fromRowIdx = -1
  values.forEach((r, i) => {
    const id = cell(r, cId).trim()
    const m = /^AS(\d+)$/i.exec(id)
    if (m) {
      maxId = Math.max(maxId, Number(m[1]))
      lastRow = i + 1
    }
    if (id === row.sourceLegacyId) srcRowIdx = i
    if (id === row.audienceFromLegacyId) fromRowIdx = i
  })
  if (srcRowIdx < 0) throw new Error(`${row.sourceLegacyId} not found in the Ad Set Builder`)
  const legacyId = `AS${String(maxId + 1).padStart(3, "0")}`
  const newRow = lastRow + 1
  const srcRow = srcRowIdx + 1
  const width = header.length

  const out: string[] = []
  for (let i = 0; i < width; i++) {
    let v = cell(values[srcRowIdx], i)
    if (fromRowIdx >= 0 && audienceCols.includes(i)) v = cell(values[fromRowIdx], i)
    // Shift same-row references in formulas (e.g. $A12 → $A40); leave absolute ranges like $A:$M alone.
    if (v.startsWith("=")) v = v.replace(new RegExp(`(\\$?[A-Z]{1,3}\\$?)${srcRow}(?!\\d)`, "g"), `$1${newRow}`)
    out.push(v)
  }
  out[cId] = legacyId
  if (cPlatform >= 0) out[cPlatform] = ""
  if (cStatus >= 0) out[cStatus] = row.status
  if (cNotes >= 0) out[cNotes] = row.notes

  const lastCol = columnToLetter(width)
  await batchWriteCells(sheets, sheetId, [{ range: `'${esc}'!A${newRow}:${lastCol}${newRow}`, values: [out] }], {
    userEntered: true,
  })
  // Platform ID as plain text (USER_ENTERED would round an 18-digit number).
  if (cPlatform >= 0) {
    await batchWriteCells(sheets, sheetId, [
      { range: `'${esc}'!${columnToLetter(cPlatform + 1)}${newRow}`, values: [[row.platformAdSetId]] },
    ])
  }
  let name: string | null = null
  if (cName >= 0) {
    const back = await readSheetValues(sheets, sheetId, tab, `${columnToLetter(cName + 1)}${newRow}`)
    name = (back[0]?.[0] ?? "").trim() || null
  }
  return { legacyId, name }
}

/** CREATE_AD_SET from rule 10: copy the winner, swap in the tested audience's targeting. */
export async function executeAudienceTest(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const p = effectivePayload(rec)
  const sourceId = String(p.source_ad_set_id ?? rec.target_ad_set_id ?? "")
  const targetingFromId = String(p.targeting_from_ad_set_id ?? "")
  if (!rec.target_campaign_id || !sourceId || !targetingFromId) {
    return { success: false, error: "Audience test needs target_campaign_id, source_ad_set_id and targeting_from_ad_set_id" }
  }
  try {
    const [{ data: campaign }, { data: source }, { data: from }] = await Promise.all([
      admin.from("campaigns").select("id, legacy_id, platform_campaign_id, event").eq("id", rec.target_campaign_id).maybeSingle(),
      admin.from("ad_sets").select("id, legacy_id, platform_adset_id, conv_event").eq("id", sourceId).maybeSingle(),
      admin.from("ad_sets").select("id, legacy_id, audience_src, placement, platform_adset_id").eq("id", targetingFromId).maybeSingle(),
    ])
    if (!campaign?.platform_campaign_id) return { success: false, error: "Campaign isn't linked to Meta yet" }
    if (!source?.platform_adset_id) return { success: false, error: "Source ad set isn't linked to Meta" }
    if (!from?.platform_adset_id) return { success: false, error: "Audience ad set isn't linked to Meta" }

    const targetingSrc = await adSetMeta(from.platform_adset_id as string)
    const newMetaId = await copyAdSet(source.platform_adset_id as string, campaign.platform_campaign_id as string)

    const ev = (source.conv_event as string) || (campaign.event as string)
    const { legacyId, name: sheetName } = await appendAdSetBuilderRow({
      sourceLegacyId: source.legacy_id as string,
      audienceFromLegacyId: from.legacy_id as string,
      status: "PAUSED",
      notes: `Audience test: ${from.legacy_id} audience on the ${source.legacy_id} setup (approved recommendation). Review, then turn on in Ads Manager.`,
      platformAdSetId: newMetaId,
    })
    const name = sheetName || `${legacyId}_${String(from.audience_src).toLowerCase()}_${from.placement}`

    await graph("POST", newMetaId, { name, targeting: JSON.stringify(targetingSrc.targeting ?? {}) })

    await admin.from("ad_sets").upsert(
      {
        legacy_id: legacyId,
        campaign_id: campaign.id,
        name,
        audience_src: from.audience_src,
        placement: from.placement,
        conv_event: ev,
        status: "PAUSED",
        platform_adset_id: newMetaId,
        created_by: "META_AGENT",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "legacy_id" }
    )

    return { success: true, meta_response: { new_adset_id: newMetaId, legacy_id: legacyId, name } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** ADVANCE_PHASE from rule 05: draft the next-phase campaign in Meta (paused) from the namer row. */
export async function executeAdvancePhase(rec: Recommendation, admin: SupabaseClient): Promise<ExecutorResult> {
  const p = effectivePayload(rec)
  if (p.warning) return { success: false, error: "Watchlist item — nothing to build" }
  if (!rec.target_campaign_id) return { success: false, error: "Missing target_campaign_id" }
  try {
    const { data: source } = await admin
      .from("campaigns")
      .select("id, legacy_id, name, persona, service, phase, event, platform_campaign_id")
      .eq("id", rec.target_campaign_id)
      .maybeSingle()
    if (!source?.platform_campaign_id) return { success: false, error: "Source campaign isn't linked to Meta" }

    const toPhase = String(p.to_phase ?? "")
    const { data: nextRows } = await admin
      .from("campaigns")
      .select("id, legacy_id, name, event, phase, status, platform_campaign_id, daily_budget_usd")
      .eq("persona", source.persona)
      .eq("service", source.service)
      .eq("phase", toPhase)
      .is("platform_campaign_id", null)
      .order("legacy_id")
    const suggested = [
      ...((p.soft_launch_p2_campaigns as { id?: string }[] | undefined) ?? []),
      ...((p.matching_p3_campaigns as { id?: string }[] | undefined) ?? []),
    ].map((x) => x?.id)
    const pool = nextRows ?? []
    const next =
      pool.find((c) => suggested.includes(c.id)) ?? pool.find((c) => c.status === "DRAFT") ?? pool[0]
    if (!next) {
      return { success: false, error: `No unlinked ${toPhase} ${source.persona}/${source.service} campaign in the namer to build` }
    }

    const ccMap = await fetchCustomConversionEventMap(getMetaAdAccountId())
    const ccId = [...ccMap.entries()].find(([, ev]) => ev === next.event)?.[0]
    if (!ccId) {
      return {
        success: false,
        error: `No custom conversion for ${next.event} in Events Manager (name it ${next.event}_<event>) — create it, then re-approve`,
      }
    }

    const srcCampaign = await graph("GET", source.platform_campaign_id as string, {
      fields: "objective,special_ad_categories,buying_type,daily_budget,bid_strategy,is_adset_budget_sharing_enabled",
    })
    const campaignParams: Record<string, string> = {
      name: next.name as string,
      objective: String(srcCampaign.objective),
      status: "PAUSED",
      special_ad_categories: JSON.stringify(srcCampaign.special_ad_categories ?? []),
    }
    if (srcCampaign.daily_budget) {
      campaignParams.daily_budget = String(
        next.daily_budget_usd ? Math.round(Number(next.daily_budget_usd) * 100) : srcCampaign.daily_budget
      )
      if (srcCampaign.bid_strategy) campaignParams.bid_strategy = String(srcCampaign.bid_strategy)
    } else if (srcCampaign.is_adset_budget_sharing_enabled !== undefined) {
      campaignParams.is_adset_budget_sharing_enabled = "false"
    }
    const actId = getMetaAdAccountId()
    const created = await graph("POST", `${actId.startsWith("act_") ? actId : `act_${actId}`}/campaigns`, campaignParams)
    const newCampaignId = String(created.id)
    // Link immediately so a later failure can't lead to a second campaign being created on re-approval.
    await admin.from("campaigns").update({ platform_campaign_id: newCampaignId, updated_at: new Date().toISOString() }).eq("id", next.id)

    const best = await bestAdSet(admin, source.id as string, source.event as string)
    if (!best?.platform_adset_id) {
      return { success: true, meta_response: { new_campaign_id: newCampaignId, note: "Campaign created; no ad set to copy" } }
    }
    const newAdSetId = await copyAdSet(best.platform_adset_id as string, newCampaignId)

    // Name it after the next campaign's own builder ad set (same audience if there is one).
    const { data: nextSets } = await admin
      .from("ad_sets")
      .select("id, legacy_id, name, audience_src")
      .eq("campaign_id", next.id)
      .order("legacy_id")
    const named = (nextSets ?? []).find((s) => s.audience_src === best.audience_src) ?? (nextSets ?? [])[0]

    const srcSet = await adSetMeta(best.platform_adset_id as string)
    const promoted: Json = { ...((srcSet.promoted_object as Json) ?? {}), custom_conversion_id: ccId }
    if (!promoted.custom_event_type) promoted.custom_event_type = "OTHER"
    await graph("POST", newAdSetId, {
      ...(named ? { name: named.name as string } : {}),
      promoted_object: JSON.stringify(promoted),
    })

    if (named) {
      await admin.from("ad_sets").update({ platform_adset_id: newAdSetId, updated_at: new Date().toISOString() }).eq("id", named.id)
    }

    return {
      success: true,
      meta_response: {
        new_campaign_id: newCampaignId,
        new_campaign: next.legacy_id,
        new_adset_id: newAdSetId,
        new_adset: named?.legacy_id ?? null,
        optimizes_on: next.event,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
