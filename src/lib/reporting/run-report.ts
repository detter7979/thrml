/**
 * Nightly unified report.
 *
 *   1. Pull the last 45 days from Meta, Google Ads and GA4 (restating late conversions).
 *   2. Replace that window in report_platform_daily / report_ga4_daily (the database keeps history).
 *   3. Join everything by platform IDs with the namer lookup.
 *   4. Rewrite the Drive files:
 *        Raw/Meta_Raw_Last45Days         partner data as Meta returns it
 *        Raw/GoogleAds_Raw_Last45Days    partner data as Google returns it
 *        Cleaned/thrml_Cleaned_Last45Days  Cleaned · Lookup · GA4 · About
 *        Finance Tracker › Platform Data   same rows as Cleaned (spend stays in column AB)
 *
 * Test mode reads only is_test rows (from the scenario runner) and writes only the Test file.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { createGoogleSheetsClient, ensureTabExists, listSpreadsheetTabs, type SheetsClient } from "@/lib/agent/google-sheets-client"

import { fetchGa4ByUtm } from "./fetch-ga4"
import { type RawSheet, fetchGoogleAdDaily, fetchMetaAdDaily } from "./fetch-platforms"
import { type Ga4DailyRow, type PlatformDailyRow, buildUnified, lookupToValues, unifiedToValues, utcDaysAgo } from "./unified"

export const REPORT_WINDOW_DAYS = 45

export type ReportRunResult = {
  ok: boolean
  test: boolean
  from: string
  to: string
  fetched: { meta: number; google: number; ga4: number }
  rows: number
  unmatchedAds: number
  sheets: string[]
  errors: string[]
}

async function setting(admin: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle()
  return data?.value ? String(data.value).replace(/^"|"$/g, "") : null
}

type Cell = string | number

async function writeTab(sheets: SheetsClient, spreadsheetId: string, tab: string, values: Cell[][]) {
  await ensureTabExists(sheets, spreadsheetId, tab)
  const esc = tab.replace(/'/g, "''")
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${esc}'` })
  const chunk = 5000
  for (let i = 0; i < Math.max(values.length, 1); i += chunk) {
    const slice = values.slice(i, i + chunk)
    if (!slice.length) break
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${esc}'!A${i + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: slice },
    })
  }
}

/** Drop the default empty "Sheet1" once our tabs exist, and freeze the header row. */
async function tidy(sheets: SheetsClient, spreadsheetId: string, tabs: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" })
  const props = (meta.data.sheets ?? []).map((s) => s.properties!)
  const requests: object[] = []
  for (const p of props) {
    if (tabs.includes(p.title!)) {
      requests.push({
        updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" },
      })
    }
  }
  const sheet1 = props.find((p) => p.title === "Sheet1")
  if (sheet1 && props.length > 1) requests.push({ deleteSheet: { sheetId: sheet1.sheetId } })
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

async function replaceWindow<T extends object>(
  admin: SupabaseClient,
  table: "report_platform_daily" | "report_ga4_daily",
  from: string,
  to: string,
  rows: T[],
  scope: { platform?: string; is_test: boolean }
) {
  let del = admin.from(table).delete().eq("is_test", scope.is_test).gte("date", from).lte("date", to)
  if (scope.platform) del = del.eq("platform", scope.platform)
  const { error: dErr } = await del
  if (dErr) throw new Error(`${table} delete: ${dErr.message}`)
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(
      rows.slice(i, i + 500).map((r) => ({ ...r, is_test: scope.is_test, updated_at: new Date().toISOString() }))
    )
    if (error) throw new Error(`${table} insert: ${error.message}`)
  }
}

/** Collapse duplicate keys (e.g. two Meta rows for one ad-day after a rename) before upsert. */
function dedupePlatform(rows: PlatformDailyRow[]): PlatformDailyRow[] {
  const m = new Map<string, PlatformDailyRow>()
  for (const r of rows) {
    const k = `${r.date}|${r.platform}|${r.ad_id}`
    const cur = m.get(k)
    if (!cur) {
      m.set(k, { ...r, conversions: { ...r.conversions } })
      continue
    }
    cur.spend += r.spend
    cur.impressions += r.impressions
    cur.reach += r.reach
    cur.clicks += r.clicks
    cur.link_clicks += r.link_clicks
    cur.revenue += r.revenue
    for (const [e, n] of Object.entries(r.conversions)) cur.conversions[e] = (cur.conversions[e] ?? 0) + n
  }
  return [...m.values()]
}

function dedupeGa4(rows: Ga4DailyRow[]): Ga4DailyRow[] {
  const m = new Map<string, Ga4DailyRow>()
  for (const r of rows) {
    const k = [r.date, r.source, r.medium, r.campaign, r.utm_id, r.term, r.content].join("|")
    const cur = m.get(k)
    if (!cur) {
      m.set(k, { ...r, events: { ...r.events } })
      continue
    }
    cur.sessions += r.sessions
    cur.engaged_sessions += r.engaged_sessions
    cur.revenue += r.revenue
    for (const [e, n] of Object.entries(r.events)) cur.events[e] = (cur.events[e] ?? 0) + n
  }
  return [...m.values()]
}

const rawValues = (raw: RawSheet): Cell[][] => (raw.headers.length ? [raw.headers, ...raw.rows] : [])

export async function runUnifiedReport(
  admin: SupabaseClient,
  opts: { test?: boolean; days?: number; fetch?: boolean } = {}
): Promise<ReportRunResult> {
  const test = Boolean(opts.test)
  const days = opts.days ?? REPORT_WINDOW_DAYS
  const from = utcDaysAgo(days)
  const to = utcDaysAgo(test ? 0 : 1)
  const errors: string[] = []
  const fetched = { meta: 0, google: 0, ga4: 0 }
  const written: string[] = []
  let metaRaw: RawSheet | null = null
  let googleRaw: RawSheet | null = null

  // 1–2. Pull and store (live mode only).
  if (!test && opts.fetch !== false) {
    const [meta, google, ga4] = await Promise.allSettled([
      fetchMetaAdDaily(from, to),
      fetchGoogleAdDaily(from, to),
      fetchGa4ByUtm(from, to),
    ])
    if (meta.status === "fulfilled") {
      metaRaw = meta.value.raw
      fetched.meta = meta.value.rows.length
      await replaceWindow(admin, "report_platform_daily", from, to, dedupePlatform(meta.value.rows), { platform: "meta", is_test: false })
    } else errors.push(`Meta: ${meta.reason instanceof Error ? meta.reason.message : meta.reason}`)
    if (google.status === "fulfilled") {
      googleRaw = google.value.raw
      fetched.google = google.value.rows.length
      await replaceWindow(admin, "report_platform_daily", from, to, dedupePlatform(google.value.rows), { platform: "google", is_test: false })
    } else errors.push(`Google Ads: ${google.reason instanceof Error ? google.reason.message : google.reason}`)
    if (ga4.status === "fulfilled") {
      fetched.ga4 = ga4.value.length
      await replaceWindow(admin, "report_ga4_daily", from, to, dedupeGa4(ga4.value), { is_test: false })
    } else errors.push(`GA4: ${ga4.reason instanceof Error ? ga4.reason.message : ga4.reason}`)
  }

  // 3. Join.
  const built = await buildUnified(admin, { from, to, test })
  const values = unifiedToValues(built.rows)
  const unmatchedAds = built.rows.filter((r) => r["In Namer"] !== "yes").length

  // 4. Drive.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sheets = createGoogleSheetsClient()
    const about: Cell[][] = [
      ["thrml unified paid media report"],
      [""],
      ["Last refreshed (UTC)", new Date().toISOString().replace("T", " ").slice(0, 16)],
      ["Window", `${from} to ${to} (${days} days, rewritten nightly so late conversions are restated)`],
      ["Rows", built.rows.length],
      ["Ads not in the namer", unmatchedAds],
      ["Errors", errors.join(" | ") || "none"],
      [""],
      ["How it joins"],
      ["Cleaned", "One row per day × platform × ad. Spend, delivery and platform conversions come from Meta / Google Ads by ad ID."],
      ["Names", "Campaign / ad set / ad names and naming fields come from the namer (Lookup tab) by platform ID. Fix a namer row and every past day updates on the next run."],
      ["GA4", "Matched by utm_content = ad ID (utm_term = ad set ID, utm_id = campaign ID). Unmatched GA4 rows stay on the GA4 tab."],
      ["thrml bookings", "Bookings stamped with the first-touch utm_content (ad ID) at checkout. Revenue = total charged."],
      ["ROAS", "Three versions: platform-reported, GA4, and thrml bookings. They use different attribution, so expect them to differ."],
      ["Tip", "Pivot on Cleaned. The Lookup tab is there for your own VLOOKUPs by Platform ID."],
      ...(test ? [[""], ["TEST DATA", "Synthetic scenario rows from the admin Evaluator tab. Not real performance."]] : []),
    ]

    const cleanedId = await setting(admin, test ? "gdrive_test_cleaned_report_id" : "gdrive_cleaned_report_id")
    if (cleanedId) {
      try {
        await writeTab(sheets, cleanedId, "Cleaned", values)
        await writeTab(sheets, cleanedId, "Lookup", lookupToValues(built.lookup))
        await writeTab(sheets, cleanedId, "GA4", built.ga4Rows)
        await writeTab(sheets, cleanedId, "About", about)
        await tidy(sheets, cleanedId, ["Cleaned", "Lookup", "GA4"])
        written.push(test ? "TEST_thrml_Cleaned_Last45Days" : "thrml_Cleaned_Last45Days")
      } catch (e) {
        errors.push(`Cleaned sheet: ${e instanceof Error ? e.message : e}`)
      }
    }

    if (!test) {
      const raws: [string, RawSheet | null, string][] = [
        ["gdrive_meta_raw_report_id", metaRaw, "Meta Raw"],
        ["gdrive_google_raw_report_id", googleRaw, "Google Ads Raw"],
      ]
      for (const [key, raw, tab] of raws) {
        if (!raw) continue
        const id = await setting(admin, key)
        if (!id) continue
        try {
          await writeTab(sheets, id, tab, rawValues(raw).length ? rawValues(raw) : [["No delivery in the window"]])
          await tidy(sheets, id, [tab])
          written.push(tab)
        } catch (e) {
          errors.push(`${tab}: ${e instanceof Error ? e.message : e}`)
        }
      }

      const trackerId = (await setting(admin, "gdrive_master_report_id")) ?? (await setting(admin, "gdrive_finance_sheet_id"))
      if (trackerId) {
        try {
          const tabs = await listSpreadsheetTabs(sheets, trackerId)
          if (!tabs.includes("Platform Data")) await ensureTabExists(sheets, trackerId, "Platform Data")
          // Keep history older than the window (the P&L sums L90 / YTD spend from this tab),
          // remapped to the current columns by header name; replace the window itself.
          const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerId,
            range: "'Platform Data'",
            valueRenderOption: "UNFORMATTED_VALUE",
            dateTimeRenderOption: "FORMATTED_STRING",
          })
          const old = (existing.data.values ?? []) as Cell[][]
          const oldHeader = (old[0] ?? []).map((h) => String(h).trim())
          const idx = new Map(oldHeader.map((h, i) => [h, i]))
          const header = values[0] as string[]
          const kept = old
            .slice(1)
            .filter((r) => {
              const d = String(r[0] ?? "")
              return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < from
            })
            .map((r) => header.map((h) => (idx.has(h) ? (r[idx.get(h)!] ?? "") : "")))
          await writeTab(sheets, trackerId, "Platform Data", [header, ...kept, ...values.slice(1)])
          written.push("Finance Tracker › Platform Data")
        } catch (e) {
          errors.push(`Platform Data: ${e instanceof Error ? e.message : e}`)
        }
      }
    }
  }

  return { ok: errors.length === 0, test, from, to, fetched, rows: built.rows.length, unmatchedAds, sheets: written, errors }
}
