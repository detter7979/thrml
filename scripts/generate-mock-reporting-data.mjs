/**
 * thrml Mock Reporting Data Generator v3
 * - Raw:     Meta_Daily Report_MM.DD.YY  → Raw/ Drive folder  (slate blue header)
 * - Cleaned: Meta_Cleaned_MM.DD.YY       → Cleaned/ folder    (dark charcoal header)
 * - Auto-copies cleaned → Platform Data tab in Finance Tracker
 * Run: node scripts/generate-mock-reporting-data.mjs
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
})
const drive  = google.drive({ version: "v3", auth })
const sheets = google.sheets({ version: "v4", auth })

const RAW_FOLDER_ID     = "15FIxUe7411b3hzPEB7AzRlQgYRt9EzGo"
const CLEANED_FOLDER_ID = "1yjIh556CkkQxWZ8oq_mZFtKKISVn1n6b"
const MASTER_ID         = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"  // Finance Tracker
const REPORT_ID         = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"  // Master Report (pivots)
const NAMER_ID          = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

const TODAY_ISO       = new Date().toISOString().slice(0, 10)
const TODAY_FORMATTED = new Date()
  .toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
  .replace(/\//g, ".")

// ── Value helpers ──────────────────────────────────────────────────────────
const na = v => (!v || v === "-" || v === "—" || v === "" ? "NA" : v)

// Words that must remain ALL CAPS
const ALLCAPS = new Set([
  "UGC","LAL","RSA","CRM","CTA","CTR","CPM","CPC","CPA","ROAS","CAC","ROI",
  "API","URL","SEO","SEM","PPC","DSP","DMP","SSP","KPI","AOV","TV","OOH","DOOH",
  "PMAX","REELS","FEED","SEA","US","NA","GOOG","META","SNAP",
])
const tc = s => {
  if (!s || s === "NA") return "NA"
  if (/^[CP]\d{3}$/.test(s) || /^(AS|AD)\d{3}$/.test(s) || /^P\d$/.test(s)) return s
  return s.replace(/_/g, " ").replace(/\w+/g, w => {
    const up = w.toUpperCase()
    return ALLCAPS.has(up) ? up : w[0].toUpperCase() + w.slice(1).toLowerCase()
  })
}

// ── Display maps ────────────────────────────────────────────────────────────
const FUNNEL_D    = { PROSP:"Prospecting", LAL:"Lookalike", LAL1:"Lookalike", LAL2:"Lookalike", RT:"Retargeting" }
const OBJECTIVE_D = { REACH:"Reach", LEAD:"Lead", CONV:"Conversion", AWARE:"Awareness" }
const GEO_D       = { SEA:"Seattle", ALL:"All", US:"US" }
const PLATFORM_D  = { META:"Meta", GOOG:"Google", SNAP:"Snapchat", TIKTOK:"TikTok" }

// Targeting Tactic: source + tier merged (no separate Audience Tier column)
const TACTIC_MAP = {
  int:         "Interest",
  lal1:        "LAL 1%",
  lal2:        "LAL 2%",
  lal:         "LAL",
  rt_checkout: "Retargeting - Checkout",
  rt_listing:  "Retargeting - Listing",
  crmatch:     "CRM Match",
}

const fmt = (n, d = 2) => Number(n).toFixed(d)
const jit = (base, pct = 0.18) => base * (1 + (Math.random() - 0.5) * pct)

// ── Date dimension helper ──────────────────────────────────────────────────
// Returns { year, month, week } e.g. { year:"2026", month:"Apr", week:"Week 13 (04/09 - 04/15/26)" }
function dateFields(isoDate) {
  const d    = new Date(isoDate + "T12:00:00Z")
  const year = String(d.getUTCFullYear())
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) // "Apr"

  // ISO week number (Mon–Sun)
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayOfWeek = tmp.getUTCDay() || 7          // Mon=1 … Sun=7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayOfWeek) // nearest Thursday
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7)

  // Monday of that week
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() || 7) - 1))
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)

  const pad = n => String(n).padStart(2, "0")
  const yy  = String(d.getUTCFullYear()).slice(2)
  const monStr = `${pad(mon.getUTCMonth()+1)}/${pad(mon.getUTCDate())}`
  const sunStr = `${pad(sun.getUTCMonth()+1)}/${pad(sun.getUTCDate())}`
  const week = `Week ${weekNum} (${monStr} - ${sunStr}/${yy})`

  return { year, month, week }
}

// ── Column schemas ─────────────────────────────────────────────────────────
const RAW_HEADERS = [
  "Date", "Platform",
  "Campaign ID", "Campaign Name",
  "Ad Set ID", "Ad Set Name",
  "Ad ID", "Ad Name",
  "Impressions", "Reach", "Link Clicks", "Spend ($)",
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  "Video Views 100%",
]

const CLEANED_HEADERS = [
  "Date", "Year", "Month", "Week",           // ← new date dimensions
  "Platform",
  "Campaign ID", "Ad Set ID", "Ad ID",
  "Campaign Name", "Ad Set Name", "Ad Name",
  "Phase", "Campaign Objective", "Funnel Stage",
  "Audience Group", "Targeting Name", "Geo",
  "Space Type", "Targeting Tactic", "Placement",
  "Angle", "Format Type", "Length", "Aspect Ratio", "CTA",
  "Hook Copy", "Opt. Event",
  "Spend ($)", "Impressions", "Reach", "Link Clicks",
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  "Video Views 100%",
]

// ── Load Targeting Lookup ──────────────────────────────────────────────────
async function loadTargetingLookup() {
  const defaults = {
    gen:"General Interest", sauna:"Sauna Interest", hottub:"Hot Tub Interest",
    coldplunge:"Cold Plunge Interest", income:"Income / Earn Interest",
    wellness:"Wellness Interest", biohacking:"Biohacking Interest",
    checkout_rt:"Checkout Retargeting", listing_rt:"Listing View Retargeting",
    all_spaces:"All Spaces",
  }
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: "Targeting Lookup!A2:B100" })
    return (r.data.values ?? []).reduce((acc, row) => {
      if (row[0] && row[1]) acc[row[0].toLowerCase().trim()] = row[1].trim()
      return acc
    }, { ...defaults })
  } catch { return defaults }
}

// ── Load live Namer data ───────────────────────────────────────────────────
async function loadNamer() {
  const [cb, ab, cr] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: NAMER_ID, range: "Campaign Builder!A2:L20" }),
    sheets.spreadsheets.values.get({ spreadsheetId: NAMER_ID, range: "Ad Set Builder!A2:J30" }),
    sheets.spreadsheets.values.get({ spreadsheetId: NAMER_ID, range: "Creative Builder!A2:Q25" }),
  ])
  // Campaign Builder: CampID(0) Platform(1) Phase(2) Funnel(3) Objective(4) Goal(5) AudType(6) Geo(7) CampName(8) Event(9)
  const camps = (cb.data.values ?? []).filter(r => r[0]).map(r => ({
    id: r[0], platform: r[1], phase: r[2], funnel: r[3], objective: r[4],
    goal: r[5], audType: r[6], geo: r[7], name: r[8], event: r[9],
  }))
  // Ad Set Builder: AsID(0) CampID(1) CampName(2) SpaceType(3) AudSrc(4) Placement(5) Details(6) AdSetName(7) ConvEvent(8)
  const adsets = (ab.data.values ?? []).filter(r => r[0]).map(r => ({
    id: r[0], campId: r[1], spaceType: r[3], audSrc: r[4], placement: r[5], name: r[7], event: r[8],
  }))
  // Creative Builder: AdID(0) AsID(1) CampID(2) Concept(3) Format(4) Length(5) Size(6) Variant(7) CTA(8) AdSetName(9) AdName(10) Hook(11)
  const creatives = (cr.data.values ?? []).filter(r => r[0]).map(r => ({
    id: r[0], asId: r[1], campId: r[2], concept: r[3], format: r[4],
    length: r[5], size: r[6], variant: r[7], cta: r[8], adName: r[10], hook: r[11],
  }))
  return { camps, adsets, creatives }
}

// ── Generate rows for one date ─────────────────────────────────────────────
function genRows(namer, lookup, dateStr) {
  const campMap  = Object.fromEntries(namer.camps.map(c => [c.id, c]))
  const adsetMap = Object.fromEntries(namer.adsets.map(a => [a.id, a]))
  const raw = [], cleaned = []

  for (const cr of namer.creatives) {
    const camp  = campMap[cr.campId]
    const adset = adsetMap[cr.asId]
    if (!camp || !adset) continue

    const ph      = parseInt(camp.phase?.replace("P", "") || "1")
    const isVideo = ["video", "ugc"].includes(cr.format?.toLowerCase())
    const isGoog  = camp.platform?.toUpperCase() === "GOOG"

    const baseSpend  = isGoog ? 24 : (ph === 1 ? 13 : ph === 2 ? 29 : 23)
    const baseImps   = isGoog ? 3800 : (ph === 1 ? 9500 : ph === 2 ? 7200 : 3400)
    const baseReach  = Math.round(baseImps * 0.91)
    const baseClicks = isGoog ? 260 : Math.round(baseImps * 0.022)

    const spend  = jit(baseSpend)
    const imps   = Math.round(jit(baseImps))
    const reach  = Math.round(jit(baseReach))
    const clicks = Math.round(jit(baseClicks))
    const bhc    = camp.event === "become_host_click"       ? Math.max(0, Math.round(jit(16, 0.45))) : 0
    const hos    = camp.event === "host_onboarding_started" ? Math.max(0, Math.round(jit(11, 0.5)))  : 0
    const lc     = camp.event === "listing_created"         ? Math.max(0, Math.round(jit(3,  0.6)))  : 0
    const pur    = camp.event === "Purchase"                ? Math.max(0, Math.round(jit(2,  0.7)))  : 0
    const vv100  = isVideo ? Math.round(jit(baseImps * 0.07, 0.3)) : 0

    // Derived cleaned dimensions
    const platform  = na(PLATFORM_D[camp.platform?.toUpperCase()] ?? tc(camp.platform))
    const objective = na(tc(OBJECTIVE_D[camp.objective?.toUpperCase()] ?? camp.objective))
    const funnel    = na(tc(FUNNEL_D[camp.funnel?.toUpperCase()] ?? camp.funnel))
    const audGroup  = na(tc(camp.audType))
    const geo       = na(GEO_D[camp.geo?.toUpperCase()] ?? tc(camp.geo))
    const spaceType = na(tc(adset.spaceType))
    const audSrcKey = adset.audSrc?.toLowerCase() ?? ""
    const tactic    = na(TACTIC_MAP[audSrcKey] ?? tc(adset.audSrc))
    const placement = na(tc(adset.placement))
    const tgtName   = na(lookup[adset.spaceType?.toLowerCase()] ?? tc(adset.spaceType))
    const angle     = na(tc(cr.concept))
    const fmtType   = na(tc(cr.format))         // UGC, RSA stay all caps via ALLCAPS set
    const length    = na(cr.length)
    const ratio     = na(cr.size)
    const cta       = na(tc(cr.cta?.replace(/_/g, " ")))
    const hook      = na(cr.hook)
    const optEvent  = na(camp.event)

    // RAW — minimal, platform-export style
    raw.push([
      dateStr, PLATFORM_D[camp.platform?.toUpperCase()] ?? camp.platform,
      camp.id, camp.name,
      adset.id, adset.name,
      cr.id, cr.adName ?? cr.id,
      String(imps), String(reach), String(clicks), fmt(spend),
      String(bhc), String(hos), String(lc), String(pur), String(vv100),
    ])

    // CLEANED — fully parsed, title-cased, NA-filled, acronyms preserved
    const df = dateFields(dateStr)
    cleaned.push([
      dateStr, df.year, df.month, df.week,   // Date + date dimensions
      platform,
      camp.id, adset.id, cr.id,
      camp.name, adset.name, cr.adName ?? cr.id,
      na(camp.phase), objective, funnel,
      audGroup, tgtName, geo,
      spaceType, tactic, placement,
      angle, fmtType, length, ratio, cta,
      hook, optEvent,
      fmt(spend), String(imps), String(reach), String(clicks),
      String(bhc), String(hos), String(lc), String(pur), String(vv100),
    ])
  }
  return { raw, cleaned }
}

// ── Per-sheet formatting (raw = slate blue, cleaned = dark charcoal) ───────
async function formatSheet(spreadsheetId, numCols, type) {
  const RAW_HDR     = { red: 0.231, green: 0.290, blue: 0.420 }   // slate blue
  const CLEANED_HDR = { red: 0.102, green: 0.078, blue: 0.063 }   // dark charcoal
  const RAW_ROW_BG  = { red: 0.965, green: 0.973, blue: 0.992 }   // light blue tint
  const white       = { red: 1, green: 1, blue: 1 }
  const hdrColor    = type === "raw" ? RAW_HDR : CLEANED_HDR

  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sid  = meta.data.sheets?.[0]?.properties?.sheetId ?? 0

  const cw = (s, e, px) => ({ updateDimensionProperties: {
    range: { sheetId: sid, dimension: "COLUMNS", startIndex: s, endIndex: e },
    properties: { pixelSize: px }, fields: "pixelSize",
  }})

  const requests = [
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: {
      range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
      cell: { userEnteredFormat: { backgroundColor: hdrColor, textFormat: { foregroundColor: white, bold: true, fontSize: 10 }, verticalAlignment: "MIDDLE", padding: { top: 6, bottom: 6 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
    }},
    // Raw data rows get a subtle blue wash to reinforce "unprocessed"
    ...(type === "raw" ? [{
      repeatCell: {
        range: { sheetId: sid, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: numCols },
        cell: { userEnteredFormat: { backgroundColor: RAW_ROW_BG } },
        fields: "userEnteredFormat(backgroundColor)",
      }
    }] : []),
    cw(0, 1, 90), cw(1, 2, 70), cw(2, 3, 75), cw(3, 4, 75), cw(4, 5, 65),
    cw(5, 8, 220), cw(8, numCols, 90),
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

// ── Drive write: update existing or create new ─────────────────────────────
async function writeToSheet(folderId, fileName, headers, rows, type = "cleaned") {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  const existingId = res.data.files?.[0]?.id
  if (existingId) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: existingId, range: "Sheet1!A1:Z10000" })
    await sheets.spreadsheets.values.update({
      spreadsheetId: existingId, range: "Sheet1!A1", valueInputOption: "RAW",
      requestBody: { values: [headers, ...rows] },
    })
    await formatSheet(existingId, headers.length, type)
    console.log(`  ✅ Updated [${type}]: ${fileName} (${rows.length} rows)`)
    return existingId
  }
  try {
    const created = await drive.files.create({
      requestBody: { name: fileName, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
      fields: "id",
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: created.data.id, range: "Sheet1!A1", valueInputOption: "RAW",
      requestBody: { values: [headers, ...rows] },
    })
    await formatSheet(created.data.id, headers.length, type)
    console.log(`  ✅ Created [${type}]: ${fileName} (${rows.length} rows)`)
    return created.data.id
  } catch (e) {
    console.log(`  ⚠️  Cannot write '${fileName}' — quota exceeded.`)
    console.log(`     → Create blank Sheet in folder, share with thrml-agent@watchful-muse-350902.iam.gserviceaccount.com, re-run.`)
    return null
  }
}

// ── Ensure Targeting Lookup tab ────────────────────────────────────────────
async function ensureTargetingLookup() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabs = meta.data.sheets.map(s => ({ title: s.properties.title, id: s.properties.sheetId }))
  let tab = tabs.find(t => t.title === "Targeting Lookup")
  if (!tab) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "Targeting Lookup" } } }] } })
    tab = { title: "Targeting Lookup", id: r.data.replies[0].addSheet.properties.sheetId }
  }
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: "Targeting Lookup!A1:A2" })
  if ((existing.data.values ?? []).length > 0) { console.log("  ✓  Targeting Lookup populated"); return }

  const dark = { red: 0.102, green: 0.078, blue: 0.063 }, white = { red: 1, green: 1, blue: 1 }
  const rows = [
    ["gen","General Interest","Broad gen interest — wide host awareness"],
    ["sauna","Sauna Interest","Sauna owner/enthusiast — cedar barrel, barrel sauna"],
    ["hottub","Hot Tub Interest","Hot tub, jacuzzi, hydrotherapy"],
    ["coldplunge","Cold Plunge Interest","Ice bath, Wim Hof, cold therapy"],
    ["income","Income / Earn Interest","Passive income, Airbnb host, STR"],
    ["wellness","Wellness Interest","Yoga, spa, mindfulness, Calm, Headspace"],
    ["biohacking","Biohacking Interest","Huberman, longevity, cold exposure"],
    ["checkout_rt","Checkout Retargeting","Initiated checkout, no purchase, 14d window"],
    ["listing_rt","Listing View Retargeting","Viewed listing, no checkout, 7d window"],
    ["all_spaces","All Spaces","All listing types combined"],
  ]
  await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "Targeting Lookup!A1",
    valueInputOption: "RAW", requestBody: { values: [["Raw Value", "Display Name", "Notes"], ...rows] } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
      cell: { userEnteredFormat: { backgroundColor: dark, textFormat: { foregroundColor: white, bold: true }, padding: { top: 5, bottom: 5 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,padding)" } },
    { updateDimensionProperties: { range: { sheetId: tab.id, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: tab.id, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: tab.id, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 300 }, fields: "pixelSize" } },
  ]}})
  console.log("  ✅ Targeting Lookup seeded — edit Display Name to update all reports globally")
}

// ── Format Platform Data tab ───────────────────────────────────────────────
async function formatPlatformData() {
  const meta  = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const sid   = meta.data.sheets.find(s => s.properties.title === "Platform Data")?.properties.sheetId
  if (sid === undefined) return
  const dark = { red: 0.102, green: 0.078, blue: 0.063 }, white = { red: 1, green: 1, blue: 1 }
  const purple = { red: 0.94, green: 0.92, blue: 0.99 }
  const tgtTint = { red: 0.85, green: 0.80, blue: 0.99 }
  const amber = { red: 1.0, green: 0.94, blue: 0.8 }
  const cw = (s, e, px) => ({ updateDimensionProperties: {
    range: { sheetId: sid, dimension: "COLUMNS", startIndex: s, endIndex: e },
    properties: { pixelSize: px }, fields: "pixelSize" }})
  // New col layout (0-based):
  // 0=Date 1=Year 2=Month 3=Week 4=Platform
  // 5=CampID 6=AsID 7=AdID  8=CampName 9=AsName 10=AdName
  // 11=Phase 12=CampObj 13=Funnel
  // 14=AudGroup 15=TgtName 16=Geo
  // 17=SpaceType 18=TgtTactic 19=Placement
  // 20=Angle 21=FmtType 22=Length 23=Ratio 24=CTA
  // 25=Hook 26=OptEvent
  // 27=Spend 28=Imps 29=Reach 30=Clicks 31=BHC 32=HOS 33=LC 34=Pur 35=VV100
  const dateDimTint = { red: 0.90, green: 0.96, blue: 0.90 } // light green tint for Year/Month/Week
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: CLEANED_HEADERS.length },
      cell: { userEnteredFormat: { backgroundColor: dark, textFormat: { foregroundColor: white, bold: true, fontSize: 10 }, verticalAlignment: "MIDDLE", padding: { top: 6, bottom: 6 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)" } },
    // Year/Month/Week header tint
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: dateDimTint, textFormat: { foregroundColor: dark, bold: true, fontSize: 10 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    // Year/Month/Week data rows — same light green
    { repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 1, endColumnIndex: 4 },
      cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.99, blue: 0.95 } } },
      fields: "userEnteredFormat(backgroundColor)" } },
    // ID cols (5,6,7) purple monospace
    { repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 5, endColumnIndex: 8 },
      cell: { userEnteredFormat: { backgroundColor: purple, textFormat: { fontFamily: "Courier New", fontSize: 9, bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    // Targeting Name header (15) stronger tint
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 15, endColumnIndex: 16 },
      cell: { userEnteredFormat: { backgroundColor: tgtTint, textFormat: { bold: true, fontSize: 10 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    // Format group headers (21,22,23) amber
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 21, endColumnIndex: 24 },
      cell: { userEnteredFormat: { backgroundColor: amber, textFormat: { foregroundColor: dark, bold: true, fontSize: 10 } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    cw(0,1,90),  cw(1,2,55),  cw(2,3,50),  cw(3,4,175), // Date, Year, Month, Week
    cw(4,5,70),                                            // Platform
    cw(5,6,75),  cw(6,7,75),  cw(7,8,65),               // IDs
    cw(8,9,230), cw(9,10,250),cw(10,11,155),             // Names
    cw(11,12,50),cw(12,13,115),cw(13,14,115),            // Phase, Obj, Funnel
    cw(14,15,95),cw(15,16,175),cw(16,17,75),             // AudGroup, TgtName, Geo
    cw(17,18,90),cw(18,19,160),cw(19,20,130),            // SpaceType, Tactic, Placement
    cw(20,21,115),cw(21,22,80),cw(22,23,65),cw(23,24,85),cw(24,25,90), // Angle, Format, Length, Ratio, CTA
    cw(25,26,195),cw(26,27,175),                          // Hook, OptEvent
    cw(27,36,80),                                          // Metrics
  ]}})
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 thrml Mock Reporting — ${TODAY_FORMATTED}\n`)

  console.log("📋 Targeting Lookup...")
  await ensureTargetingLookup()

  console.log("\n📖 Loading Namer + lookup...")
  const [namer, lookup] = await Promise.all([loadNamer(), loadTargetingLookup()])
  console.log(`   ${namer.camps.length} campaigns | ${namer.adsets.length} ad sets | ${namer.creatives.length} creatives`)

  // Generate 7 days for Platform Data
  const allCleaned = []
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate() - d)
    const iso = dt.toISOString().slice(0, 10)
    const { cleaned } = genRows(namer, lookup, iso)
    allCleaned.push(...cleaned)
  }

  // Today's slices for Drive files
  const { raw: todayRaw, cleaned: todayCleaned } = genRows(namer, lookup, TODAY_ISO)
  console.log(`   Generated: ${todayRaw.length} rows/day × 7 days = ${allCleaned.length} total`)

  // Raw file → Drive (slate blue header + light blue row tint)
  console.log(`\n📁 Raw:     Meta_Daily Report_Raw_${TODAY_FORMATTED}`)
  await writeToSheet(RAW_FOLDER_ID, `Meta_Daily Report_Raw_${TODAY_FORMATTED}`, RAW_HEADERS, todayRaw, "raw")

  // Cleaned file → Drive (dark charcoal header)
  console.log(`📁 Cleaned: Meta_Daily Report_Cleaned_${TODAY_FORMATTED}`)
  await writeToSheet(CLEANED_FOLDER_ID, `Meta_Daily Report_Cleaned_${TODAY_FORMATTED}`, CLEANED_HEADERS, todayCleaned, "cleaned")

  // Full replace Platform Data (7-day history)
  console.log("\n📊 Updating Platform Data tabs...")
  for (const [label, sid] of [["Finance Tracker", MASTER_ID], ["Master Report", REPORT_ID]]) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: sid, range: "Platform Data!A1:AZ10000" })
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid, range: "Platform Data!A1",
      valueInputOption: "USER_ENTERED",   // numeric strings parsed as numbers
      requestBody: { values: [CLEANED_HEADERS, ...allCleaned] },
    })
    console.log(`  ✅ ${label}: ${allCleaned.length} rows`)
  }
  await formatPlatformData()

  // Acronym spot-check
  const sampleTactics  = [...new Set(allCleaned.map(r => r[15]))].join(", ")
  const sampleFormats  = [...new Set(allCleaned.map(r => r[18]))].join(", ")
  const sampleTgtNames = [...new Set(allCleaned.map(r => r[12]))].slice(0, 4).join(", ")

  console.log(`\n✅ Done — ${CLEANED_HEADERS.length} columns, ${allCleaned.length} rows`)
  console.log(`   Targeting Tactics:  ${sampleTactics}`)
  console.log(`   Format Types:       ${sampleFormats}`)
  console.log(`   Targeting Names:    ${sampleTgtNames}`)
  console.log(`\n📊 Finance Tracker: https://docs.google.com/spreadsheets/d/${MASTER_ID}`)
  console.log(`📊 Master Report:   https://docs.google.com/spreadsheets/d/${REPORT_ID}`)
  console.log(`💡 Raw = slate blue header + light blue rows | Cleaned = dark charcoal header\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
