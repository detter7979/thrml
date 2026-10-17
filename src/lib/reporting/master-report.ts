/**
 * thrml — Master Report (Google Sheets): the place to pivot without cluttering the dashboard.
 *
 *   README         what each tab is and how it refreshes
 *   Master Data    the FULL history (every day since tracking began), rewritten nightly from the
 *                  database, so conversions that restate after the click are always current. Same
 *                  columns as Cleaned.
 *   Targets        per-event target costs from admin › Paid media › Rules, with last-7 / last-30 /
 *                  all-time cost per result against target (formulas on Master Data)
 *   Lookup         the namer, by platform ID (for your own VLOOKUPs)
 *   Overview · Host Funnel · Guest Funnel · Creative · Ad Leaderboard · Audiences · Weekly Trend
 *                  native pivot tables on Master Data. They update by themselves when Master Data
 *                  is rewritten. They are created once: edit them freely. Delete a pivot tab and
 *                  the next refresh (or "Rebuild pivots") puts the default back.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { createGoogleSheetsClient, type SheetsClient } from "@/lib/agent/google-sheets-client"

import { tidy, writeTab } from "./sheets-io"
import { UNIFIED_HEADERS, buildUnified, lookupToValues, unifiedToValues, utcDaysAgo, type Lookup } from "./unified"

type Cell = string | number
type Header = (typeof UNIFIED_HEADERS)[number]

/** First day of tracking; Master Data covers everything from here. */
export const HISTORY_START = "2026-01-01"

/** Tabs from the April-test version of the Master Report, replaced by this build. */
export const LEGACY_TABS = [
  "Performance Report",
  "Host Creative",
  "Guest Creative",
  "Spend Breakdown",
  "Targeting Lookup",
  "Reference Table",
  "Platform Data",
]

const col = (h: Header) => {
  const i = UNIFIED_HEADERS.indexOf(h)
  if (i < 0) throw new Error(`Unknown column ${h}`)
  return i
}

function letter(i: number) {
  let n = i + 1
  let s = ""
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ── Pivot definitions ──────────────────────────────────────────────────────

type Fmt = "money" | "int" | "pct" | "x"
type PivotValue = { name: string; sum?: Header; formula?: string; fmt: Fmt }
type PivotDef = {
  tab: string
  note: string
  rows: Header[]
  filter?: { column: Header; values: string[] }
  values: PivotValue[]
}

const S = (h: Header) => `SUM('${h}')`
const ratio = (a: string, b: string) => `=IFERROR(${a}/${b},0)`

const SPEND: PivotValue = { name: "Spend", sum: "Spend ($)", fmt: "money" }
const IMPR: PivotValue = { name: "Impressions", sum: "Impressions", fmt: "int" }
const LINK: PivotValue = { name: "Link Clicks", sum: "Link Clicks", fmt: "int" }
const CTR: PivotValue = { name: "CTR", formula: ratio(S("Link Clicks"), S("Impressions")), fmt: "pct" }
const RESULTS: PivotValue = { name: "Results", sum: "Results (Opt. Event)", fmt: "int" }
const CPR: PivotValue = { name: "Cost / Result", formula: ratio(S("Spend ($)"), S("Results (Opt. Event)")), fmt: "money" }
const SESSIONS: PivotValue = { name: "Sessions (GA4)", sum: "Sessions (GA4)", fmt: "int" }
const CPS: PivotValue = { name: "Cost / Session", formula: ratio(S("Spend ($)"), S("Sessions (GA4)")), fmt: "money" }
const REV_GA4: PivotValue = { name: "Revenue (GA4)", sum: "Revenue (GA4)", fmt: "money" }
const ROAS_GA4: PivotValue = { name: "ROAS (GA4)", formula: ratio(S("Revenue (GA4)"), S("Spend ($)")), fmt: "x" }
const BOOKINGS: PivotValue = { name: "Bookings (thrml)", sum: "Bookings (thrml)", fmt: "int" }
const REV_THRML: PivotValue = { name: "Booking Revenue (thrml)", sum: "Booking Revenue (thrml)", fmt: "money" }
const ROAS_THRML: PivotValue = { name: "ROAS (thrml)", formula: ratio(S("Booking Revenue (thrml)"), S("Spend ($)")), fmt: "x" }

export const PIVOTS: PivotDef[] = [
  {
    tab: "Overview",
    note: "Spend, results and revenue by platform, persona and phase.",
    rows: ["Platform", "Persona", "Phase"],
    values: [SPEND, IMPR, LINK, CTR, RESULTS, CPR, SESSIONS, CPS, REV_GA4, ROAS_GA4, BOOKINGS, REV_THRML, ROAS_THRML],
  },
  {
    tab: "Host Funnel",
    note: "Become-host click → host signup → first listing, by phase and campaign (platform-reported and GA4).",
    rows: ["Phase", "Namer Campaign"],
    filter: { column: "Persona", values: ["host"] },
    values: [
      SPEND,
      LINK,
      { name: "BH (platform)", sum: "BH (platform)", fmt: "int" },
      { name: "HO (platform)", sum: "HO (platform)", fmt: "int" },
      { name: "NL (platform)", sum: "NL (platform)", fmt: "int" },
      { name: "Cost / BH", formula: ratio(S("Spend ($)"), S("BH (platform)")), fmt: "money" },
      { name: "Cost / HO", formula: ratio(S("Spend ($)"), S("HO (platform)")), fmt: "money" },
      { name: "Cost / NL", formula: ratio(S("Spend ($)"), S("NL (platform)")), fmt: "money" },
      { name: "Click → BH", formula: ratio(S("BH (platform)"), S("Link Clicks")), fmt: "pct" },
      { name: "BH → HO", formula: ratio(S("HO (platform)"), S("BH (platform)")), fmt: "pct" },
      { name: "HO → NL", formula: ratio(S("NL (platform)"), S("HO (platform)")), fmt: "pct" },
      { name: "become_host_click (GA4)", sum: "become_host_click (GA4)", fmt: "int" },
      { name: "host_onboarding_started (GA4)", sum: "host_onboarding_started (GA4)", fmt: "int" },
      { name: "host_first_listing_created (GA4)", sum: "host_first_listing_created (GA4)", fmt: "int" },
    ],
  },
  {
    tab: "Guest Funnel",
    note: "Sessions → listing views → checkout → bookings, with GA4 and thrml revenue, by phase and campaign.",
    rows: ["Phase", "Namer Campaign"],
    filter: { column: "Persona", values: ["guest"] },
    values: [
      SPEND,
      SESSIONS,
      CPS,
      { name: "View Listing (GA4)", sum: "View Listing (GA4)", fmt: "int" },
      { name: "Begin Checkout (GA4)", sum: "Begin Checkout (GA4)", fmt: "int" },
      { name: "Purchases (GA4)", sum: "Purchases (GA4)", fmt: "int" },
      { name: "Session → View", formula: ratio(S("View Listing (GA4)"), S("Sessions (GA4)")), fmt: "pct" },
      { name: "View → Checkout", formula: ratio(S("Begin Checkout (GA4)"), S("View Listing (GA4)")), fmt: "pct" },
      { name: "Checkout → Purchase", formula: ratio(S("Purchases (GA4)"), S("Begin Checkout (GA4)")), fmt: "pct" },
      { name: "Cost / Purchase (GA4)", formula: ratio(S("Spend ($)"), S("Purchases (GA4)")), fmt: "money" },
      REV_GA4,
      ROAS_GA4,
      BOOKINGS,
      REV_THRML,
      ROAS_THRML,
    ],
  },
  {
    tab: "Creative",
    note: "Angle × format by persona: what message and format work.",
    rows: ["Persona", "Angle", "Format"],
    values: [SPEND, IMPR, LINK, CTR, RESULTS, CPR, SESSIONS, CPS, ROAS_GA4],
  },
  {
    tab: "Ad Leaderboard",
    note: "Every ad with its hook. Sort any column (Data › Pivot table editor › Sort by).",
    rows: ["Persona", "Namer Ad", "Hook Copy"],
    values: [SPEND, IMPR, CTR, RESULTS, CPR, SESSIONS, REV_GA4, ROAS_GA4],
  },
  {
    tab: "Audiences",
    note: "Audience × placement by persona: who to scale and who to cut.",
    rows: ["Persona", "Audience Src", "Placement"],
    values: [SPEND, IMPR, LINK, CTR, RESULTS, CPR, SESSIONS, CPS, ROAS_GA4],
  },
  {
    tab: "Weekly Trend",
    note: "Week-over-week by persona.",
    rows: ["Week", "Persona"],
    values: [SPEND, IMPR, LINK, CTR, RESULTS, CPR, SESSIONS, REV_GA4, ROAS_GA4, BOOKINGS],
  },
]

const NUMBER_FORMATS: Record<Fmt, { type: string; pattern: string }> = {
  money: { type: "CURRENCY", pattern: '"$"#,##0.00' },
  int: { type: "NUMBER", pattern: "#,##0" },
  pct: { type: "PERCENT", pattern: "0.0%" },
  x: { type: "NUMBER", pattern: '0.00"×"' },
}

async function sheetIds(sheets: SheetsClient, spreadsheetId: string): Promise<Map<string, number>> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" })
  return new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]))
}

function pivotRequests(def: PivotDef, sheetId: number, sourceSheetId: number): object[] {
  const pivotTable = {
    source: { sheetId: sourceSheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: UNIFIED_HEADERS.length },
    rows: def.rows.map((h) => ({ sourceColumnOffset: col(h), showTotals: true, sortOrder: "ASCENDING" })),
    values: def.values.map((v) =>
      v.formula
        ? { summarizeFunction: "CUSTOM", name: v.name, formula: v.formula }
        : { summarizeFunction: "SUM", name: v.name, sourceColumnOffset: col(v.sum!) }
    ),
    valueLayout: "HORIZONTAL",
    // Source rows are open-ended (Master Data grows), so skip the empty rows under the data.
    filterSpecs: [
      { columnOffsetIndex: col("Date"), filterCriteria: { condition: { type: "NOT_BLANK" } } },
      ...(def.filter ? [{ columnOffsetIndex: col(def.filter.column), filterCriteria: { visibleValues: def.filter.values } }] : []),
    ],
  }
  const firstValueCol = def.rows.length
  return [
    // Title + note in rows 1–2, pivot from row 4.
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          { values: [{ userEnteredValue: { stringValue: def.tab }, userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }] },
          { values: [{ userEnteredValue: { stringValue: def.note }, userEnteredFormat: { textFormat: { italic: true, foregroundColor: { red: 0.43, green: 0.36, blue: 0.29 } } } }] },
        ],
        fields: "userEnteredValue,userEnteredFormat",
      },
    },
    { updateCells: { start: { sheetId, rowIndex: 3, columnIndex: 0 }, rows: [{ values: [{ pivotTable }] }], fields: "pivotTable" } },
    ...def.values.map((v, i) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 4, startColumnIndex: firstValueCol + i, endColumnIndex: firstValueCol + i + 1 },
        cell: { userEnteredFormat: { numberFormat: NUMBER_FORMATS[v.fmt] } },
        fields: "userEnteredFormat.numberFormat",
      },
    })),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 4 } }, fields: "gridProperties.frozenRowCount" } },
  ]
}

function masterDataFormats(sheetId: number): object[] {
  const fmt = (headers: Header[], f: Fmt) =>
    headers.map((h) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: col(h), endColumnIndex: col(h) + 1 },
        cell: { userEnteredFormat: { numberFormat: NUMBER_FORMATS[f] } },
        fields: "userEnteredFormat.numberFormat",
      },
    }))
  return [
    ...fmt(["Spend ($)", "Revenue (platform)", "Revenue (GA4)", "Booking Revenue (thrml)", "CPC", "CPM", "Cost / Result", "Cost / Session"], "money"),
    ...fmt(["CTR"], "pct"),
    ...fmt(["ROAS (platform)", "ROAS (GA4)", "ROAS (thrml)"], "x"),
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.96, green: 0.94, blue: 0.92 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
  ]
}

// ── Targets tab ────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, [string, string]> = {
  bh: ["BH", "Become-host click"],
  ho: ["HO", "Host signup (onboarding started)"],
  nl: ["NL", "First listing created"],
  act: ["ACT", "Activated host"],
  vc: ["VC", "Listing view"],
  ic: ["IC", "Checkout start"],
  pur: ["PUR", "Booking (purchase)"],
  lead: ["LEAD", "Newsletter signup"],
}

async function targetsValues(admin: SupabaseClient): Promise<Cell[][]> {
  const { data } = await admin
    .from("rules_config")
    .select("scope, rule_key, rule_value, description")
    .eq("active", true)
    .like("rule_key", "target_cost_%_usd")
  const md = "'Master Data'"
  const c = (h: Header) => `${md}!${letter(col(h))}:${letter(col(h))}`
  const rows = (data ?? [])
    .map((r) => {
      const code = /^target_cost_(.+)_usd$/.exec(r.rule_key as string)?.[1] ?? ""
      const [ev, label] = EVENT_LABELS[code] ?? [code.toUpperCase(), code]
      return { ev, label, persona: String(r.scope).startsWith("host") ? "host" : "guest", target: Number(r.rule_value) || 0, desc: String(r.description ?? "") }
    })
    .sort((a, b) => a.persona.localeCompare(b.persona) || Object.keys(EVENT_LABELS).indexOf(a.ev.toLowerCase()) - Object.keys(EVENT_LABELS).indexOf(b.ev.toLowerCase()))

  const out: Cell[][] = [
    ["Targets vs actual", "", "", "", "", "", "", "", "", "", "", ""],
    ["Targets come from admin › Paid media › Rules (refreshed nightly). Actuals sum Master Data rows whose Opt. Event matches.", "", "", "", "", "", "", "", "", "", "", ""],
    ["Persona", "Event", "What it is", "Target ($)", "Spend 7d", "Results 7d", "Cost / Result 7d", "vs Target 7d", "Spend 30d", "Results 30d", "Cost / Result 30d", "All-time Cost / Result"],
  ]
  rows.forEach((r, i) => {
    const n = i + 4
    // Master Data dates are yyyy-mm-dd text, so compare as text inside FILTER (SUMIFS would parse them).
    const since = (h: Header, days: number) =>
      `SUM(IFERROR(FILTER(${c(h)},${c("Opt. Event")}=$B${n},${c("Date")}>=TEXT(TODAY()-${days},"yyyy-mm-dd")),0))`
    const sinceSpend = (days: number) => since("Spend ($)", days)
    const sinceRes = (days: number) => since("Results (Opt. Event)", days)
    out.push([
      r.persona,
      r.ev,
      r.label,
      r.target,
      `=${sinceSpend(7)}`,
      `=${sinceRes(7)}`,
      `=IFERROR(E${n}/F${n},"")`,
      `=IF(G${n}="","no results",IF(G${n}<=D${n},"✅ at/under target","⚠️ "&TEXT(G${n}/D${n},"0.0")&"× target"))`,
      `=${sinceSpend(30)}`,
      `=${sinceRes(30)}`,
      `=IFERROR(I${n}/J${n},"")`,
      `=IFERROR(SUMIFS(${c("Spend ($)")},${c("Opt. Event")},$B${n})/SUMIFS(${c("Results (Opt. Event)")},${c("Opt. Event")},$B${n}),"")`,
    ])
  })
  return out
}

// ── Build ──────────────────────────────────────────────────────────────────

export type MasterReportResult = {
  spreadsheetId: string
  rows: number
  from: string
  to: string
  pivotsCreated: string[]
  legacyRemoved: string[]
}

export async function buildMasterReport(
  admin: SupabaseClient,
  opts: { test?: boolean; spreadsheetId: string; rebuildPivots?: boolean; removeLegacyTabs?: boolean; lookup?: Lookup; sheets?: SheetsClient }
): Promise<MasterReportResult> {
  const sheets = opts.sheets ?? createGoogleSheetsClient()
  const id = opts.spreadsheetId
  const from = HISTORY_START
  const to = utcDaysAgo(opts.test ? 0 : 1)
  const built = await buildUnified(admin, { from, to, test: opts.test, lookup: opts.lookup })
  const values = unifiedToValues(built.rows)

  // Data tabs (rewritten every run).
  await writeTab(sheets, id, "Master Data", values)
  await writeTab(sheets, id, "Targets", [[""]]) // create + clear; formulas written below
  await writeTab(sheets, id, "Lookup", lookupToValues(built.lookup))
  await writeTab(sheets, id, "README", readme(opts.test ?? false, from, to, built.rows.length))

  // Targets formulas need USER_ENTERED (writeTab writes RAW).
  const targets = await targetsValues(admin)
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: "'Targets'!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: targets },
  })

  let ids = await sheetIds(sheets, id)
  const requests: object[] = []
  const legacyRemoved: string[] = []
  if (opts.removeLegacyTabs) {
    for (const t of LEGACY_TABS) {
      const sid = ids.get(t)
      if (sid !== undefined) {
        requests.push({ deleteSheet: { sheetId: sid } })
        legacyRemoved.push(t)
      }
    }
  }

  // Pivot tabs: create when missing (or on rebuild); otherwise leave the user's edits alone.
  const pivotsCreated: string[] = []
  const toCreate = PIVOTS.filter((p) => opts.rebuildPivots || !ids.has(p.tab))
  for (const p of toCreate) {
    const existing = ids.get(p.tab)
    if (existing !== undefined) requests.push({ deleteSheet: { sheetId: existing } })
    requests.push({ addSheet: { properties: { title: p.tab } } })
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } })
  ids = await sheetIds(sheets, id)

  const md = ids.get("Master Data")!
  const fmtReqs: object[] = [...masterDataFormats(md)]
  const tId = ids.get("Targets")
  if (tId !== undefined) {
    fmtReqs.push(
      { repeatCell: { range: { sheetId: tId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: "userEnteredFormat.textFormat" } },
      { repeatCell: { range: { sheetId: tId, startRowIndex: 2, endRowIndex: 3 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.96, green: 0.94, blue: 0.92 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
      ...[3, 4, 6, 8, 10, 11].map((c) => ({
        repeatCell: { range: { sheetId: tId, startRowIndex: 3, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat: NUMBER_FORMATS.money } }, fields: "userEnteredFormat.numberFormat" },
      }))
    )
  }
  for (const p of toCreate) {
    fmtReqs.push(...pivotRequests(p, ids.get(p.tab)!, md))
    pivotsCreated.push(p.tab)
  }

  // Tab order: README, pivots, Targets, Master Data, Lookup.
  const order = ["README", ...PIVOTS.map((p) => p.tab), "Targets", "Master Data", "Lookup"]
  order.forEach((t, i) => {
    const sid = ids.get(t)
    if (sid !== undefined) fmtReqs.push({ updateSheetProperties: { properties: { sheetId: sid, index: i }, fields: "index" } })
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: fmtReqs } })
  await tidy(sheets, id, ["Master Data", "Lookup"])

  return { spreadsheetId: id, rows: built.rows.length, from, to, pivotsCreated, legacyRemoved }
}

function readme(test: boolean, from: string, to: string, rows: number): Cell[][] {
  return [
    [test ? "TEST — thrml Master Report (synthetic data)" : "thrml — Master Report"],
    [""],
    ["Last refreshed (UTC)", new Date().toISOString().replace("T", " ").slice(0, 16)],
    ["History", `${from} to ${to} · ${rows} rows`],
    [""],
    ["Tab", "What it is"],
    ["Overview", "Spend, results, sessions and revenue by platform › persona › phase."],
    ["Host Funnel", "Become-host click → host signup → first listing: counts, cost per step and step conversion rates."],
    ["Guest Funnel", "GA4 sessions → listing views → checkout → purchases, with GA4 and thrml booking revenue and ROAS."],
    ["Creative", "Angle × format by persona."],
    ["Ad Leaderboard", "Every ad with its hook copy."],
    ["Audiences", "Audience × placement by persona."],
    ["Weekly Trend", "Week-over-week by persona."],
    ["Targets", "Your per-event target costs (admin › Rules) vs last 7 days, last 30 days and all time."],
    ["Master Data", "Every day × platform × ad since tracking began. Rewritten nightly from the database, so late conversions are always current. Same columns as the Cleaned file."],
    ["Lookup", "The namer by platform ID, for your own VLOOKUPs."],
    [""],
    ["Editing pivots", "The pivot tabs are created once and never overwritten, so edit, re-sort, filter or add fields freely (click a pivot cell › Pivot table editor). Delete a pivot tab to get the default back on the next refresh."],
    ["Results", "\"Results\" is each row's own optimization event (BH, HO, NL, VC, IC, PUR). Summing across mixed events is only meaningful within one persona/phase."],
    ["ROAS", "Three versions: platform-reported, GA4 (purchase value), and thrml bookings (stamped with the ad ID at checkout). Expect them to differ."],
    ["Names", "Names and naming fields come from the namer by platform ID: fix a namer row and every past day updates on the next refresh."],
  ]
}
