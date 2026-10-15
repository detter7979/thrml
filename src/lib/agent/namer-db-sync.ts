/**
 * Namer builders → Supabase paid-media tables (campaigns, ad_sets).
 *
 * The Sheet is where names, taxonomy and status are decided; the evaluator and dashboard read
 * Supabase. This copies every Campaign Builder / Ad Set Builder row with an ID into the DB,
 * keyed on legacy_id (C001 / AS001), including its Platform ID (or null when the sheet has none,
 * so stale or placeholder IDs never linger). Rows that are linked to Meta get their live status
 * from meta-status-sync afterwards; this only sets the status the sheet says.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  createGoogleSheetsClient,
  listSpreadsheetTabs,
  readSheetValues,
  resolveTabTitle,
} from "@/lib/agent/google-sheets-client"
import {
  DEFAULT_BUDGET_MODE,
  parseAdSetConventionName,
  parseCampaignConventionName,
} from "@/lib/agent/namer-convention-parse"
import { cellValue, findAdSetBuilderHeader, findCampaignBuilderHeader } from "@/lib/agent/namer-header-utils"
import { NAMER_TAB_CANDIDATES } from "@/lib/agent/namer-sheet-schema"
import type { EventT, StatusT } from "@/types/paid-media"

const CAMP_ID = [/^camp\s*id$/i, /^campaign\s*id$/i]
const AD_SET_ID = [/^ad\s*set\s*id$/i, /^adset\s*id$/i]
const PLATFORM_CAMP_ID = [/platform\s*camp(aign)?\s*id/i]
const PLATFORM_AD_SET_ID = [/platform\s*ad\s*set\s*id/i, /platform\s*adset\s*id/i]
const STATUS = [/^status$/i]
const CAMPAIGN_NAME = [/campaign name/i]
const AD_SET_NAME = [/ad set name/i]
const BUDGET = [/budget\s*\/\s*day/i, /daily budget/i, /^budget(\s*\(\$\))?$/i]
const CONV_EVENT = [/conv(ersion)?\.?\s*event/i, /^opt\.?\s*event$/i, /^event$/i]
const NOTES = [/^notes$/i, /audience details/i]
const BUDGET_MODE = [/budget\s*mode/i, /^abo\s*\/\s*cbo$/i]

export function mapSheetStatusToDb(status: string): StatusT {
  const s = status.trim().toUpperCase()
  if (s === "SCALE" || s === "TEST" || s === "PAUSED" || s === "KILLED" || s === "ARCHIVED") return s
  return "DRAFT"
}

/** Meta pixel event names and our tokens → event_t. */
export function convEventToDb(raw: string): EventT | null {
  const v = raw.trim().replace(/[\s_-]/g, "").toLowerCase()
  const map: Record<string, EventT> = {
    lead: "LEAD",
    completeregistration: "LEAD",
    viewcontent: "VC",
    vc: "VC",
    initiatecheckout: "IC",
    ic: "IC",
    purchase: "PUR",
    pur: "PUR",
    bh: "BH",
    becomehost: "BH",
    ho: "HO",
    hostonboard: "HO",
    nl: "NL",
    newlisting: "NL",
    act: "ACT",
    hostactivated: "ACT",
  }
  return map[v] ?? null
}

function cleanPlatformId(raw: string): string | null {
  const id = raw.replace(/\D/g, "")
  return id.length >= 10 ? id : null
}

export type NamerDbSyncResult = {
  campaigns_upserted: number
  ad_sets_upserted: number
  skipped: { id: string; reason: string }[]
}

export async function syncNamerBuildersToDb(admin: SupabaseClient, spreadsheetId: string): Promise<NamerDbSyncResult> {
  const out: NamerDbSyncResult = { campaigns_upserted: 0, ad_sets_upserted: 0, skipped: [] }
  const sheets = createGoogleSheetsClient()
  const tabs = await listSpreadsheetTabs(sheets, spreadsheetId)
  const now = new Date().toISOString()

  // Campaigns
  const campTab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.campaign)
  const campaignIds = new Map<string, { id: string; event: EventT }>()
  if (campTab) {
    const rows = await readSheetValues(sheets, spreadsheetId, campTab)
    const header = findCampaignBuilderHeader(rows)
    if (header) {
      for (let r = header.headerRow + 1; r < rows.length; r++) {
        const row = rows[r] ?? []
        const legacy = cellValue(row, header.headers, CAMP_ID).toUpperCase()
        if (!/^C\d+$/.test(legacy)) continue
        const name = cellValue(row, header.headers, CAMPAIGN_NAME)
        const parsed = parseCampaignConventionName(name)
        if (!parsed) {
          out.skipped.push({ id: legacy, reason: `can't parse name "${name}"` })
          continue
        }
        const budgetRaw = cellValue(row, header.headers, BUDGET).replace(/[^0-9.]/g, "")
        const budget = budgetRaw ? Number.parseFloat(budgetRaw) : null
        const { data, error } = await admin
          .from("campaigns")
          .upsert(
            {
              legacy_id: legacy,
              name: parsed.name,
              platform: parsed.platform,
              persona: parsed.persona,
              service: parsed.service,
              geo: parsed.geo,
              phase: parsed.phase,
              funnel: parsed.funnel,
              event: parsed.event,
              launch_week: parsed.launch_week,
              version: parsed.version,
              status: mapSheetStatusToDb(cellValue(row, header.headers, STATUS)),
              daily_budget_usd: budget !== null && Number.isFinite(budget) ? budget : null,
              budget_mode: /^CBO$/i.test(cellValue(row, header.headers, BUDGET_MODE)) ? "CBO" : DEFAULT_BUDGET_MODE,
              platform_campaign_id: cleanPlatformId(cellValue(row, header.headers, PLATFORM_CAMP_ID)),
              updated_at: now,
            },
            { onConflict: "legacy_id" }
          )
          .select("id")
          .single()
        if (error) {
          out.skipped.push({ id: legacy, reason: error.message })
          continue
        }
        campaignIds.set(legacy, { id: data.id as string, event: parsed.event })
        out.campaigns_upserted++
      }
    }
  }

  // Ad sets
  const setTab = resolveTabTitle(tabs, ...NAMER_TAB_CANDIDATES.ad_set)
  if (setTab) {
    const rows = await readSheetValues(sheets, spreadsheetId, setTab)
    const header = findAdSetBuilderHeader(rows)
    if (header) {
      for (let r = header.headerRow + 1; r < rows.length; r++) {
        const row = rows[r] ?? []
        const legacy = cellValue(row, header.headers, AD_SET_ID).toUpperCase()
        if (!/^AS\d+$/.test(legacy)) continue
        const campLegacy = cellValue(row, header.headers, CAMP_ID).toUpperCase()
        const parent = campaignIds.get(campLegacy)
        if (!parent) {
          out.skipped.push({ id: legacy, reason: `parent ${campLegacy || "(blank)"} not in Campaign Builder` })
          continue
        }
        const name = cellValue(row, header.headers, AD_SET_NAME)
        const parsed = parseAdSetConventionName(name)
        if (!parsed) {
          out.skipped.push({ id: legacy, reason: `can't parse name "${name}"` })
          continue
        }
        const conv = convEventToDb(cellValue(row, header.headers, CONV_EVENT)) ?? parent.event
        const { error } = await admin.from("ad_sets").upsert(
          {
            legacy_id: legacy,
            campaign_id: parent.id,
            name: parsed.name,
            audience_src: parsed.audience_src,
            placement: parsed.placement,
            conv_event: conv,
            status: mapSheetStatusToDb(cellValue(row, header.headers, STATUS)),
            platform_adset_id: cleanPlatformId(cellValue(row, header.headers, PLATFORM_AD_SET_ID)),
            audience_details: cellValue(row, header.headers, NOTES) || null,
            updated_at: now,
          },
          { onConflict: "legacy_id" }
        )
        if (error) {
          out.skipped.push({ id: legacy, reason: error.message })
          continue
        }
        out.ad_sets_upserted++
      }
    }
  }

  return out
}
