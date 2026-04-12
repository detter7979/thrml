import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── Live data from Supabase (fetched via API) ──────────────────────────────
// These values come from the Supabase queries run just before this script
const LIVE = {
  // MTD Bookings (from public.bookings WHERE month = current)
  mtdBookings:         2,
  mtdGrossBookingValue: 38.33,
  mtdPlatformRevenue:  1.83,   // service_fee (take rate ~4.8%)
  mtdHostPayouts:      32.66,
  avgHoursPerBooking:  0.5,
  totalHoursBooked:    1.0,
  uniqueGuests:        1,

  // All-time user metrics
  totalUsers:          14,
  totalHosts:          7,
  newUsersMTD:         1,
  guestsWithBookings:  3,
  avgBookingsPerGuest: 5.75,
  totalRevAllTime:     14.61,

  // Derived
  takeRatePct:         4.78,   // 1.83 / 38.33 * 100
}

const TAKE_RATE = LIVE.takeRatePct / 100
const TODAY = new Date()
const MONTH_STR = TODAY.toLocaleDateString("en-US", { month: "long", year: "numeric" })
const DAY_OF_MONTH = TODAY.getDate()
const FIXED_MONTHLY = 109.67
const FIXED_MTD = (FIXED_MONTHLY / 30) * DAY_OF_MONTH

function fmt(n, d=2) { return Number(n || 0).toFixed(d) }
function fmtDollar(n) { return `$${fmt(n)}` }
function fmtPct(n) { return `${fmt(n)}%` }

// ── Read Platform Data tab for spend aggregation ───────────────────────────
async function readPlatformData() {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_ID, range: "Platform Data!A1:AZ500"
  })
  const rows = r.data.values ?? []
  if (rows.length < 2) return { total: 0, byPlatform: {}, byPhase: {} }

  const h = rows[0]
  const iSpend = h.indexOf("Spend ($)")
  const iPlatform = h.indexOf("Platform")
  const iPhase = h.indexOf("Phase")
  const iFunnel = h.indexOf("Funnel Stage")

  const byPlatform = {}, byPhase = {}, byPlatformPhase = {}
  let total = 0

  for (const row of rows.slice(1)) {
    const spend = parseFloat(row[iSpend] ?? "0") || 0
    const platform = row[iPlatform] ?? "Unknown"
    const phase = row[iPhase] ?? ""
    const key = `${platform}_${phase}`
    total += spend
    byPlatform[platform] = (byPlatform[platform] ?? 0) + spend
    byPhase[phase] = (byPhase[phase] ?? 0) + spend
    byPlatformPhase[key] = (byPlatformPhase[key] ?? 0) + spend
  }
  return { total, byPlatform, byPhase, byPlatformPhase }
}

// ── Read Ad Hoc Costs tab ─────────────────────────────────────────────────
async function readAdHocCosts() {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_ID, range: "Ad Hoc Costs!A2:F100"
  })
  const rows = (r.data.values ?? []).filter(row =>
    row[0] && row[3] && !isNaN(parseFloat(row[3]))
  )
  const total = rows.reduce((s, r) => s + (parseFloat(r[3]) || 0), 0)
  return { total, rows }
}

// ── Build Executive Summary data ───────────────────────────────────────────
function buildExecSummary(spend, adHoc) {
  const totalAdSpend   = spend.total
  const adHocTotal     = adHoc.total
  const totalOpEx      = FIXED_MTD + adHocTotal + totalAdSpend
  const netProfit      = LIVE.mtdPlatformRevenue - FIXED_MTD - adHocTotal - totalAdSpend
  const profitMargin   = LIVE.mtdPlatformRevenue > 0 ? (netProfit / LIVE.mtdPlatformRevenue * 100) : 0

  // Unit economics
  // CAC = Total Ad Spend / New Customers (guests who made a booking)
  const cac = LIVE.guestsWithBookings > 0 ? totalAdSpend / LIVE.guestsWithBookings : 0
  // Avg booking value (gross)
  const avgBookingValue = LIVE.mtdBookings > 0 ? LIVE.mtdGrossBookingValue / LIVE.mtdBookings : 0
  // LTV estimate: avg bookings per guest × avg booking value × take rate
  // Using 12-month horizon with assumed 2x annual retention
  const estimatedYearlyBookings = LIVE.avgBookingsPerGuest * 12  // ~69/year extrapolated
  const ltv = estimatedYearlyBookings * avgBookingValue * TAKE_RATE
  const ltcacRatio = cac > 0 ? ltv / cac : 0
  const paybackPeriod = cac > 0 && (avgBookingValue * TAKE_RATE) > 0
    ? cac / (avgBookingValue * TAKE_RATE) : 0

  // Warning thresholds: flag if platform+phase spend > booking revenue attributed to that phase
  // P3 (conversion) should drive bookings; P1/P2 are awareness so more lenient
  const PHASE_REVENUE_ATTRIBUTION = {
    // P3 = direct conversion → 100% of booking revenue attributed
    "Meta_P3":   LIVE.mtdPlatformRevenue * 0.7,
    "Google_P3": LIVE.mtdPlatformRevenue * 0.3,
    // P2 = retargeting initiation → 50% attribution (assist)
    "Meta_P2":   LIVE.mtdPlatformRevenue * 0.3,
    "Google_P2": LIVE.mtdPlatformRevenue * 0.1,
    // P1 = awareness → 20% attribution (brand building)
    "Meta_P1":   LIVE.mtdPlatformRevenue * 0.1,
    "Google_P1": LIVE.mtdPlatformRevenue * 0.05,
  }

  const warnings = []
  for (const [key, budget] of Object.entries(spend.byPlatformPhase ?? {})) {
    const attributed = PHASE_REVENUE_ATTRIBUTION[key] ?? 0
    if (budget > attributed && attributed > 0) {
      warnings.push({ key, spend: budget, attributed, overage: budget - attributed })
    } else if (budget > 0 && attributed === 0) {
      warnings.push({ key, spend: budget, attributed: 0, overage: budget })
    }
  }

  return { totalAdSpend, adHocTotal, totalOpEx, netProfit, profitMargin,
    cac, ltv, ltcacRatio, paybackPeriod, avgBookingValue, warnings }
}

// ── Build sheet rows ───────────────────────────────────────────────────────
function buildRows(spend, adHoc, metrics) {
  const { totalAdSpend, adHocTotal, totalOpEx, netProfit, profitMargin,
    cac, ltv, ltcacRatio, paybackPeriod, avgBookingValue, warnings } = metrics
  const daysInMonth = new Date(TODAY.getFullYear(), TODAY.getMonth()+1, 0).getDate()
  const runRate = (v) => ((v / DAY_OF_MONTH) * daysInMonth).toFixed(2)

  return [
    // ── Title ──────────────────────────────────────────────────────────────
    ["thrml — Executive Command Center", "", "", "", ""],
    [`${MONTH_STR}  |  MTD as of Day ${DAY_OF_MONTH}/${daysInMonth}  |  Take Rate: ${fmtPct(LIVE.takeRatePct)}`, "", "", "", ""],
    [""],

    // ── 1. MTD P&L TABLE ──────────────────────────────────────────────────
    ["① MTD PROFIT & LOSS", "MTD Actual", "Month Run-Rate", "vs Budget", ""],
    ["Gross Booking Value",     fmtDollar(LIVE.mtdGrossBookingValue),  fmtDollar(runRate(LIVE.mtdGrossBookingValue)),   "—",          ""],
    ["Platform Revenue (Net)",  fmtDollar(LIVE.mtdPlatformRevenue),   fmtDollar(runRate(LIVE.mtdPlatformRevenue)),    "—",          ""],
    ["Host Payouts",           `-${fmtDollar(LIVE.mtdHostPayouts)}`,  `-${fmtDollar(runRate(LIVE.mtdHostPayouts))}`, "—",          ""],
    [""],
    ["EXPENSES", "MTD Actual", "Month Run-Rate", "", ""],
    ["Fixed OpEx",             `-${fmtDollar(FIXED_MTD)}`,            `-${fmtDollar(FIXED_MONTHLY)}`,               "budget",     ""],
    ["Ad Hoc / Variable",      `-${fmtDollar(adHocTotal)}`,           `-${fmtDollar(runRate(adHocTotal))}`,         "see tab",    ""],
    ["Total Ad Spend",         `-${fmtDollar(totalAdSpend)}`,         `-${fmtDollar(runRate(totalAdSpend))}`,       "see tab",    ""],
    ["Total OpEx",             `-${fmtDollar(totalOpEx)}`,            `-${fmtDollar(runRate(totalOpEx))}`,          "",           ""],
    [""],
    ["NET PROFIT",             fmtDollar(netProfit),                  fmtDollar(runRate(netProfit)),                "",           ""],
    ["Profit Margin",          fmtPct(profitMargin),                  "",                                           "",           ""],
    [""],

    // ── 2. AD SPEND BREAKDOWN ─────────────────────────────────────────────
    ["② AD SPEND BREAKDOWN (Platform Data tab)", "Spend ($)", "% of Total", "", ""],
    ...Object.entries(spend.byPlatform ?? {}).map(([plat, s]) => [
      plat, fmtDollar(s), fmtPct(totalAdSpend > 0 ? s/totalAdSpend*100 : 0), "", ""
    ]),
    [""],
    ["By Phase", "Spend ($)", "% of Total", "", ""],
    ...Object.entries(spend.byPhase ?? {}).map(([ph, s]) => [
      ph || "Unknown", fmtDollar(s), fmtPct(totalAdSpend > 0 ? s/totalAdSpend*100 : 0), "", ""
    ]),
    [""],

    // ── 3. MARKETPLACE HEALTH ─────────────────────────────────────────────
    ["③ MARKETPLACE HEALTH (MTD)", "Value", "", "", ""],
    ["Total Bookings",            String(LIVE.mtdBookings),            "", "", ""],
    ["Gross Booking Value",       fmtDollar(LIVE.mtdGrossBookingValue),"", "", ""],
    ["Avg Booking Value",         fmtDollar(avgBookingValue),          "", "", ""],
    ["Avg Hours / Booking",       `${fmt(LIVE.avgHoursPerBooking)}h`,  "", "", ""],
    ["Total Hours Booked",        `${fmt(LIVE.totalHoursBooked)}h`,    "", "", ""],
    ["Unique Guests",             String(LIVE.uniqueGuests),           "", "", ""],
    ["Unique Listings Booked",    "2",                                 "", "", ""],
    ["CPA (Spend / Bookings)",    LIVE.mtdBookings > 0 ? fmtDollar(totalAdSpend / LIVE.mtdBookings) : "No bookings yet", "", "", ""],
    ["Take Rate Margin",          fmtDollar(LIVE.mtdPlatformRevenue - totalAdSpend), "(Revenue − Ad Spend)", "", ""],
    ["Utilization Efficiency",    fmtPct(LIVE.totalHoursBooked / (LIVE.mtdBookings * 24 || 1) * 100), "(hrs booked / hrs possible)", "", ""],
    [""],

    // ── 4. UNIT ECONOMICS ─────────────────────────────────────────────────
    ["④ UNIT ECONOMICS", "Value", "Notes", "", ""],
    ["Total Active Users",        String(LIVE.totalUsers),             "", "", ""],
    ["Total Hosts",               String(LIVE.totalHosts),             "", "", ""],
    ["Guests w/ Bookings",        String(LIVE.guestsWithBookings),     "", "", ""],
    ["New Users MTD",             String(LIVE.newUsersMTD),            "", "", ""],
    [""],
    ["CAC (Ad Spend / New Users)", fmtDollar(cac),                   "All-time guests with bookings", "", ""],
    ["Avg Booking Value (Gross)",  fmtDollar(avgBookingValue),        "Per session", "", ""],
    ["Avg Bookings / Guest",       fmt(LIVE.avgBookingsPerGuest),     "All-time", "", ""],
    ["Est. Annual Revenue / Guest",fmtDollar(LIVE.avgBookingsPerGuest * 12 * avgBookingValue * TAKE_RATE), "Extrapolated 12-mo LTV", "", ""],
    ["LTV (12-month estimate)",    fmtDollar(ltv),                    "Avg bookings × booking value × take rate", "", ""],
    ["LTV : CAC Ratio",            ltcacRatio > 0 ? fmt(ltcacRatio) + "x" : "—",  "Target: >3x", "", ""],
    ["CAC Payback Period",         paybackPeriod > 0 ? `${fmt(paybackPeriod)} bookings` : "—", "Bookings to recover CAC", "", ""],
    [""],

    // ── 5. FUNNEL ATTRIBUTION ─────────────────────────────────────────────
    ["⑤ FUNNEL ATTRIBUTION", "Spend ($)", "Attributed Revenue ($)", "Status", ""],
    ...Object.entries(spend.byPlatformPhase ?? {}).map(([key, s]) => {
      const PHASE_REVENUE_ATTRIBUTION = {
        "Meta_P3": LIVE.mtdPlatformRevenue*0.7, "Google_P3": LIVE.mtdPlatformRevenue*0.3,
        "Meta_P2": LIVE.mtdPlatformRevenue*0.3, "Google_P2": LIVE.mtdPlatformRevenue*0.1,
        "Meta_P1": LIVE.mtdPlatformRevenue*0.1, "Google_P1": LIVE.mtdPlatformRevenue*0.05,
      }
      const attributed = PHASE_REVENUE_ATTRIBUTION[key] ?? 0
      const over = s > attributed
      return [key, fmtDollar(s), fmtDollar(attributed), over ? "⚠ OVERSPEND" : "✓ Within budget", ""]
    }),
    [""],
    ["Attribution model: P3=70%/30%, P2=30%/10%, P1=10%/5% of MTD take-rate revenue (Meta/Google)", "", "", "", ""],
    [""],

    // ── 6. WARNING SYSTEM ─────────────────────────────────────────────────
    ["⑥ WARNING SYSTEM", "", "", "", ""],
    ...(warnings.length === 0
      ? [["✅ No spend warnings — all platforms within attributed revenue thresholds", "", "", "", ""]]
      : warnings.map(w => [
          `⚠ ${w.key}`, `Spend: ${fmtDollar(w.spend)}`,
          `Attributed: ${fmtDollar(w.attributed)}`,
          `Overage: ${fmtDollar(w.overage)}`,
          "REVIEW SPEND"
        ])
    ),
    [""],
    [`Last updated: ${TODAY.toISOString().slice(0,16).replace("T"," ")} UTC  |  Source: thrml Supabase + Google Sheets`, "", "", "", ""],
  ]
}

// ── Apply formatting with conditional (RED) warnings ──────────────────────
async function applyFormatting(sheetId, rows) {
  const dark   = {red:0.102,green:0.078,blue:0.063}
  const white  = {red:1,green:1,blue:1}
  const red    = {red:0.961,green:0.231,blue:0.231}
  const orange = {red:1,green:0.596,blue:0.2}
  const green  = {red:0.204,green:0.659,blue:0.325}
  const amber  = {red:1,green:0.847,blue:0.333}

  const requests = []

  // Title row
  requests.push({repeatCell:{
    range:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:5},
    cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true,fontSize:14},padding:{top:10,bottom:10}}},
    fields:"userEnteredFormat(backgroundColor,textFormat,padding)"
  }})

  // Section header rows — find rows starting with ① ② ③ ④ ⑤ ⑥
  const sectionIndices = [], warningIndices = [], netProfitIndices = []
  rows.forEach((row, i) => {
    if (row[0]?.match(/^[①②③④⑤⑥]/)) sectionIndices.push(i)
    if (row[0] === "NET PROFIT") netProfitIndices.push(i)
    if (row[3] === "REVIEW SPEND" || row[0]?.startsWith("⚠")) warningIndices.push(i)
  })

  // Section headers: dark background
  for (const i of sectionIndices) {
    requests.push({repeatCell:{
      range:{sheetId,startRowIndex:i,endRowIndex:i+1,startColumnIndex:0,endColumnIndex:5},
      cell:{userEnteredFormat:{backgroundColor:{red:0.2,green:0.16,blue:0.13},textFormat:{foregroundColor:white,bold:true,fontSize:11},padding:{top:6,bottom:6}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,padding)"
    }})
  }

  // Net Profit row: green or red based on value
  for (const i of netProfitIndices) {
    requests.push({repeatCell:{
      range:{sheetId,startRowIndex:i,endRowIndex:i+1,startColumnIndex:0,endColumnIndex:5},
      cell:{userEnteredFormat:{backgroundColor:{red:0.898,green:0.969,blue:0.906},textFormat:{bold:true,fontSize:11}}},
      fields:"userEnteredFormat(backgroundColor,textFormat)"
    }})
  }

  // Warning rows: RED background
  for (const i of warningIndices) {
    requests.push({repeatCell:{
      range:{sheetId,startRowIndex:i,endRowIndex:i+1,startColumnIndex:0,endColumnIndex:5},
      cell:{userEnteredFormat:{backgroundColor:{red:1,green:0.9,blue:0.9},textFormat:{foregroundColor:{red:0.7,green:0.1,blue:0.1},bold:true}}},
      fields:"userEnteredFormat(backgroundColor,textFormat)"
    }})
  }

  // Freeze rows 2, column widths
  requests.push(
    {updateSheetProperties:{properties:{sheetId,gridProperties:{frozenRowCount:2}},fields:"gridProperties.frozenRowCount"}},
    {updateDimensionProperties:{range:{sheetId,dimension:"COLUMNS",startIndex:0,endIndex:1},properties:{pixelSize:280},fields:"pixelSize"}},
    {updateDimensionProperties:{range:{sheetId,dimension:"COLUMNS",startIndex:1,endIndex:5},properties:{pixelSize:145},fields:"pixelSize"}},
  )

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER_ID,requestBody:{requests}})
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📊 thrml Executive Summary Builder\n")

  // Get or create the Executive Summary tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabMap = {}
  meta.data.sheets.forEach(t => { tabMap[t.properties.title] = t.properties.sheetId })

  let execTabId = tabMap["Executive Summary"]
  if (!execTabId) {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "Executive Summary", index: 0 } } }] }
    })
    execTabId = res.data.replies[0].addSheet.properties.sheetId
    console.log("✅ Created 'Executive Summary' tab")
  } else {
    // Clear existing content
    await sheets.spreadsheets.values.clear({ spreadsheetId: MASTER_ID, range: "Executive Summary!A1:Z200" })
    console.log("✅ Cleared existing 'Executive Summary' tab")
  }

  // Read data sources
  console.log("📖 Reading Platform Data...")
  const spend = await readPlatformData()
  console.log(`   Ad spend total: $${spend.total.toFixed(2)}`)
  console.log(`   Platforms: ${Object.keys(spend.byPlatform).join(", ")}`)

  console.log("📖 Reading Ad Hoc Costs...")
  const adHoc = await readAdHocCosts()
  console.log(`   Ad hoc total: $${adHoc.total.toFixed(2)}`)

  // Calculate metrics
  const metrics = buildExecSummary(spend, adHoc)
  console.log(`   Net profit: $${metrics.netProfit.toFixed(2)}`)
  console.log(`   CAC: $${metrics.cac.toFixed(2)}, LTV: $${metrics.ltv.toFixed(2)}`)
  console.log(`   Warnings: ${metrics.warnings.length}`)

  // Build and write rows
  const rows = buildRows(spend, adHoc, metrics)
  await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID,
    range: "Executive Summary!A1",
    valueInputOption: "RAW",
    requestBody: { values: rows }
  })
  console.log(`✅ Written ${rows.length} rows`)

  // Apply formatting
  console.log("🎨 Applying formatting...")
  await applyFormatting(execTabId, rows)
  console.log("✅ Formatting applied")

  if (metrics.warnings.length > 0) {
    console.log(`\n⚠  ${metrics.warnings.length} spend warnings flagged (highlighted RED in sheet):`)
    metrics.warnings.forEach(w => {
      console.log(`   ${w.key}: spent $${w.spend.toFixed(2)}, attributed $${w.attributed.toFixed(2)}, overage $${w.overage.toFixed(2)}`)
    })
  } else {
    console.log("\n✅ No spend warnings — all platforms within thresholds")
  }

  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
