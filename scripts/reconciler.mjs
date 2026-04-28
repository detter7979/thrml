/**
 * reconciler.mjs — thrml Monthly Close Agent
 *
 * Writes monthly close reports as NEW TABS in the Finance Tracker spreadsheet.
 * This sidesteps all Drive quota / file-creation permission issues — the Finance
 * Tracker is already owned/shared with the service account.
 *
 * Tab naming: "Close_April_2026"
 * Index tab:  "Close Index" (auto-created on first run, lists all closes)
 *
 * Usage:
 *   node scripts/reconciler.mjs                    # auto-detects prior month
 *   node scripts/reconciler.mjs --month 2026-04    # explicit override
 *   node scripts/reconciler.mjs --dry-run          # validate, no writes
 *
 * GitHub Actions / CRON: "0 9 1 * *"  (9am UTC on the 1st)
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

// ── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  FINANCE_TRACKER:   "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU",
  AD_BUDGET_MONTHLY: parseFloat(process.env.AD_BUDGET_MONTHLY || "5000"),
  CREDS_PATH:        process.env.GOOGLE_CREDENTIALS_PATH || "/tmp/gcp_creds.json",
  CREDIT_LABELS:     ["credit", "invalid activity", "refund", "adjustment"],
}

// ── Colours ───────────────────────────────────────────────────────────────
const C = {
  ink:   { red:0.047, green:0.086, blue:0.157 },
  navy:  { red:0.078, green:0.133, blue:0.216 },
  teal:  { red:0.067, green:0.216, blue:0.176 },
  red:   { red:0.720, green:0.110, blue:0.110 },
  green: { red:0.067, green:0.490, blue:0.240 },
  white: { red:1,     green:1,     blue:1     },
  accent:{ red:0.651, green:0.761, blue:0.894 },
  row0:  { red:0.961, green:0.965, blue:0.976 },
  row1:  { red:0.984, green:0.984, blue:0.984 },
}
const USD  = { numberFormat:{ type:"CURRENCY", pattern:'"$"#,##0.00' } }
const PCT  = { numberFormat:{ type:"PERCENT",  pattern:"0.00%"       } }
const INT  = { numberFormat:{ type:"NUMBER",   pattern:"#,##0"       } }

// ── Auth ──────────────────────────────────────────────────────────────────
function initAuth() {
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : JSON.parse(readFileSync(CONFIG.CREDS_PATH, "utf8"))
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return { sheets: google.sheets({ version:"v4", auth }) }
}

// ── CLI args ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args  = process.argv.slice(2)
  const dry   = args.includes("--dry-run")
  const mFlag = args.indexOf("--month")
  let targetMonth
  if (mFlag !== -1 && args[mFlag+1]) {
    targetMonth = args[mFlag+1]
  } else {
    const d = new Date()
    d.setDate(1); d.setMonth(d.getMonth()-1)
    targetMonth = d.toISOString().slice(0,7)
  }
  const [year, month] = targetMonth.split("-").map(Number)
  const monthName  = new Date(year, month-1, 1).toLocaleDateString("en-US",{month:"long"})
  const tabName    = `Close_${monthName}_${year}`      // "Close_April_2026"
  const sheetName  = tabName
  return { dry, year, month, monthName, tabName, sheetName, targetMonth }
}

// ── Date helpers ──────────────────────────────────────────────────────────
function monthRange(year, month) {
  const pad = n => String(n).padStart(2,"0")
  const start   = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  return { start, end:`${year}-${pad(month)}-${lastDay}` }
}

function inMonth(dateVal, year, month) {
  if (!dateVal && dateVal !== 0) return false
  let d
  if (typeof dateVal === "number") {
    d = new Date(Date.UTC(1899,11,30) + dateVal * 86400000)
  } else {
    d = new Date(String(dateVal).slice(0,10) + "T12:00:00Z")
  }
  return !isNaN(d) && d.getUTCFullYear()===year && d.getUTCMonth()+1===month
}

// ── Tab helpers ───────────────────────────────────────────────────────────
// All writes go into the Finance Tracker as new tabs — no new files, no quota issues.
async function getOrCreateTab(sheets, spreadsheetId, tabName, index=undefined) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets.find(s => s.properties.title === tabName)
  if (existing) {
    console.log(`  ✓ Tab exists, overwriting: "${tabName}"`)
    // Clear it first
    await sheets.spreadsheets.values.clear({ spreadsheetId, range:`'${tabName}'!A1:Z500` })
    return existing.properties.sheetId
  }
  const props = { title:tabName }
  if (index !== undefined) props.index = index
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody:{ requests:[{ addSheet:{ properties:props } }] },
  })
  console.log(`  ✅ Created tab: "${tabName}"`)
  return res.data.replies[0].addSheet.properties.sheetId
}

async function upsertCloseIndex(sheets, spreadsheetId, params, summary) {
  const IDX = "Close Index"
  const meta   = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets.find(s => s.properties.title === IDX)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody:{ requests:[{ addSheet:{ properties:{ title:IDX, index:0 } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId, range:`'${IDX}'!A1:G1`, valueInputOption:"USER_ENTERED",
      requestBody:{ values:[["Month","Period","Actual ($)","Forecast ($)","Variance ($)","Status","Tab"]] },
    })
  }
  const rows = await sheets.spreadsheets.values.get({ spreadsheetId, range:`'${IDX}'!A:A` })
  // Deduplicate — update existing row if month already present
  const allRows  = rows.data.values ?? []
  const monthKey = `${params.monthName} ${params.year}`
  const existIdx = allRows.findIndex(r => r[0] === monthKey)
  const { start, end } = monthRange(params.year, params.month)
  const rowData = [[
    monthKey, `${start} → ${end}`,
    Number(summary.totalActual.toFixed(2)),
    Number(summary.forecastTotal.toFixed(2)),
    Number(summary.varianceTotal.toFixed(2)),
    summary.isOverBudget ? "🔴 OVER" : "🟢 OK",
    params.tabName,
  ]]
  const targetRow = existIdx > 0 ? existIdx + 1 : allRows.length + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId, range:`'${IDX}'!A${targetRow}:G${targetRow}`,
    valueInputOption:"USER_ENTERED", requestBody:{ values:rowData },
  })
  console.log(`  ✅ Close Index updated (row ${targetRow})`)
}

// ── Data pullers ──────────────────────────────────────────────────────────
async function pullPlatformSpend(sheets, year, month) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId:CONFIG.FINANCE_TRACKER, range:"Platform Data!A1:Z2000",
    valueRenderOption:"UNFORMATTED_VALUE",
  })
  const [hdrs,...rows] = r.data.values??[]
  if (!hdrs) return { total:0, byPlatform:{}, lineItems:[], credits:0 }
  const idx = Object.fromEntries(hdrs.map((h,i)=>[h,i]))
  const lineItems=[], byPlatform={}
  let total=0, credits=0
  for (const row of rows) {
    if (!inMonth(row[idx["Date"]], year, month)) continue
    const spend = parseFloat(row[idx["Spend ($)"]]) || 0
    const plat  = row[idx["Platform"]] ?? "Unknown"
    const camp  = row[idx["Campaign Name"]] ?? "Unknown"
    const note  = String(row[idx["Notes"]??idx["Opt. Event"]]??"").toLowerCase()
    const isCr  = CONFIG.CREDIT_LABELS.some(l=>note.includes(l))
    if (isCr) { credits += Math.abs(spend) }
    else { total += spend; byPlatform[plat]=(byPlatform[plat]||0)+spend }
    lineItems.push({ date:row[idx["Date"]], platform:plat, campaign:camp, spend, isCr })
  }
  return { total, byPlatform, lineItems, credits }
}

async function pullFixedCosts(sheets) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId:CONFIG.FINANCE_TRACKER, range:"Fixed Costs!A1:E50",
    valueRenderOption:"UNFORMATTED_VALUE",
  })
  const [hdrs,...rows] = r.data.values??[]
  const mCol = (hdrs??[]).findIndex(h=>String(h).includes("Monthly")) ?? 2
  let total=0; const items=[]
  for (const row of rows) {
    if (!row[0]) continue
    const amt = parseFloat(row[mCol])||0
    if (amt===0) continue
    items.push({ item:row[0], category:row[1]??"", monthly:amt, notes:row[4]??"" })
    total += amt
  }
  return { total, items }
}

async function pullAdHocCosts(sheets, year, month) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId:CONFIG.FINANCE_TRACKER, range:"Ad Hoc Costs!A1:F200",
    valueRenderOption:"UNFORMATTED_VALUE",
  })
  const [hdrs,...rows] = r.data.values??[]
  const idx = Object.fromEntries((hdrs??[]).map((h,i)=>[String(h).trim(),i]))
  let total=0, credits=0; const items=[]
  for (const row of rows) {
    if (!row[idx["Date"]??0]) continue
    const dv = row[idx["Date"]??0]
    const iso = typeof dv==="number"
      ? new Date(Date.UTC(1899,11,30)+dv*86400000).toISOString().slice(0,10)
      : String(dv).slice(0,10)
    if (!inMonth(iso, year, month)) continue
    const amt  = parseFloat(row[idx["Amount ($)"]??3])||0
    const item = String(row[idx["Item"]??1]??"")
    const note = String(row[idx["Notes"]??4]??"").toLowerCase()
    const isCr = CONFIG.CREDIT_LABELS.some(l=>note.includes(l)||item.toLowerCase().includes(l))
    if (isCr) { credits += Math.abs(amt) }
    else { total += amt; items.push({ date:iso, item, category:row[idx["Category"]??2]??"", amount:amt }) }
  }
  return { total, credits, items }
}

async function pullOpExForecast(sheets) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId:CONFIG.FINANCE_TRACKER, range:"OpEx!A1:E30",
    valueRenderOption:"UNFORMATTED_VALUE",
  })
  const [,...rows] = r.data.values??[]
  let total=0; const items=[]
  for (const row of rows) {
    if (!row[0]) continue
    const amt = parseFloat(row[1])||0   // col B = Monthly ($)
    if (String(row[1]).toLowerCase()==="variable"||amt===0) continue
    items.push({ item:row[0], monthly:amt, category:row[2]??"" })
    total += amt
  }
  return { total, items }
}

// ── Report writer ─────────────────────────────────────────────────────────
async function writeReport(sheets, sheetSid, params, data) {
  const { monthName, year } = params
  const { platform, fixed, adhoc, opex, adBudget } = data
  const { start, end } = monthRange(year, params.month)
  const f2 = n => Number(n).toFixed(2)

  // Reconciliation math
  const totalCredits    = platform.credits + adhoc.credits
  const adjustedAdSpend = Math.max(0, platform.total - totalCredits)
  const totalActual     = adjustedAdSpend + fixed.total + adhoc.total
  const forecastTotal   = adBudget + opex.total
  const varianceTotal   = totalActual - forecastTotal
  const variancePct     = forecastTotal>0 ? varianceTotal/forecastTotal : 0
  const isOverBudget    = varianceTotal>0
  const now             = new Date().toISOString().slice(0,10)

  // ── Row data ──────────────────────────────────────────────────────────
  const cover = [
    [`thrml — Monthly Close: ${monthName} ${year}`],
    [`Period: ${start} → ${end}   |   Generated: ${now}   |   Status: ${totalActual===0?"⚠️ ACTUALS NOT YET UPDATED":"✅ COMPLETE"}`],
    [``],
  ]
  const summaryHdr = [["CATEGORY","FORECAST ($)","ACTUAL ($)","VARIANCE ($)","VAR %","NOTES"]]
  const summaryRows = [
    ["Ad Spend (Platform)",  f2(adBudget),       f2(adjustedAdSpend),  f2(adjustedAdSpend-adBudget),    (adjustedAdSpend-adBudget)/Math.max(adBudget,1),  `Gross $${f2(platform.total)} less $${f2(totalCredits)} credits`],
    ["Fixed / OpEx",         f2(opex.total),     f2(fixed.total),      f2(fixed.total-opex.total),      (fixed.total-opex.total)/Math.max(opex.total,1),  "Recurring monthly"],
    ["Ad Hoc / Variable",    "N/A",              f2(adhoc.total),      "N/A",                           "N/A",                                             "One-time / variable"],
    ["Credits & Adjustments","—",                f2(-totalCredits),    "—",                             "—",                                               "Subtracted from Ad Spend"],
    [``],
    ["TOTAL",                f2(forecastTotal),  f2(totalActual),      f2(varianceTotal),               variancePct,                                       isOverBudget?"🔴 OVER BUDGET":"🟢 UNDER BUDGET"],
  ]
  const platHdr  = [["",""], ["AD SPEND BY PLATFORM","Actual ($)","% of Spend"]]
  const platRows = Object.entries(platform.byPlatform).sort((a,b)=>b[1]-a[1]).map(([p,v])=>
    [p, f2(v), platform.total>0?v/platform.total:0])
  const platFooter = [
    ["Gross (before credits)", f2(platform.total), ""],
    ["Credits / Invalid",      f2(-totalCredits),  ""],
    ["Net Ad Spend",           f2(adjustedAdSpend),""],
    [""],
  ]
  const fixedHdr  = [["FIXED COSTS","Monthly ($)","Category","Notes"]]
  const fixedRows = fixed.items.map(i=>[i.item, f2(i.monthly), i.category, i.notes])
  const fixedFoot = [["TOTAL FIXED", f2(fixed.total), "", ""], [""]]
  const adhocHdr  = [["AD HOC / VARIABLE COSTS","Date","Amount ($)","Category"]]
  const adhocRows = adhoc.items.length>0
    ? adhoc.items.map(i=>[i.item, i.date, f2(i.amount), i.category])
    : [[`No ad hoc costs for ${monthName} ${year}`, "", "", ""]]
  const adhocFoot = [["TOTAL AD HOC", "", f2(adhoc.total), ""]]

  const allRows = [
    ...cover, ...summaryHdr, ...summaryRows,
    ...platHdr, ...platRows, ...platFooter,
    ...fixedHdr, ...fixedRows, ...fixedFoot,
    ...adhocHdr, ...adhocRows, ...adhocFoot,
  ]

  // Write data
  await sheets.spreadsheets.values.update({
    spreadsheetId:CONFIG.FINANCE_TRACKER, range:`'${params.tabName}'!A1`,
    valueInputOption:"USER_ENTERED", requestBody:{ values:allRows },
  })

  return {
    rowCount: allRows.length,
    sRows: { sumStart: cover.length, sumEnd: cover.length+summaryHdr.length+summaryRows.length },
    summary: { totalActual, forecastTotal, varianceTotal, variancePct, isOverBudget, totalCredits },
  }
}

// ── Formatting ────────────────────────────────────────────────────────────
async function applyFormatting(sheets, sid, sRows, isOverBudget) {
  const cc = (r1,r2,c1,c2,f) => ({ repeatCell:{
    range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},
    cell:{userEnteredFormat:f},
    fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(","),
  }})
  const cw = (a,b,px) => ({ updateDimensionProperties:{
    range:{sheetId:sid,dimension:"COLUMNS",startIndex:a,endIndex:b},
    properties:{pixelSize:px}, fields:"pixelSize",
  }})
  const rh = (a,b,px) => ({ updateDimensionProperties:{
    range:{sheetId:sid,dimension:"ROWS",startIndex:a,endIndex:b},
    properties:{pixelSize:px}, fields:"pixelSize",
  }})

  const s = sRows.sumStart   // 0-indexed row where summary header is
  const e = sRows.sumEnd     // 0-indexed row after last summary row
  const totalRow = e - 2     // TOTAL row (skipping the blank spacer)

  await sheets.spreadsheets.batchUpdate({ spreadsheetId:CONFIG.FINANCE_TRACKER, requestBody:{ requests:[
    // Freeze top 3 rows
    { updateSheetProperties:{ properties:{ sheetId:sid, gridProperties:{ frozenRowCount:3 } }, fields:"gridProperties.frozenRowCount" } },
    // Cover rows 0-1 — dark header
    cc(0,1,0,6,{ backgroundColor:C.ink, textFormat:{ foregroundColor:C.white, bold:true, fontSize:16 }, verticalAlignment:"MIDDLE", padding:{ top:14, bottom:14 } }),
    cc(1,2,0,6,{ backgroundColor:C.navy, textFormat:{ foregroundColor:C.accent, fontSize:10 } }),
    rh(0,1,52), rh(1,2,24), rh(2,3,10),
    // Summary header row
    cc(s,s+1,0,6,{ backgroundColor:C.teal, textFormat:{ foregroundColor:C.white, bold:true, fontSize:11 }, verticalAlignment:"MIDDLE", padding:{ top:7, bottom:7 } }),
    rh(s,s+1,28),
    // Summary data rows — alternating
    cc(s+1,s+3,0,6,{ backgroundColor:C.row0, textFormat:{ fontSize:10 } }),
    cc(s+2,s+3,0,6,{ backgroundColor:C.row1, textFormat:{ fontSize:10 } }),
    cc(s+3,s+4,0,6,{ backgroundColor:C.row0, textFormat:{ fontSize:10 } }),
    // TOTAL row
    cc(totalRow,totalRow+1,0,6,{ backgroundColor:isOverBudget?C.red:C.green, textFormat:{ foregroundColor:C.white, bold:true, fontSize:11 }, verticalAlignment:"MIDDLE", padding:{ top:7, bottom:7 } }),
    rh(totalRow,totalRow+1,28),
    // Number formats on summary B-E
    cc(s+1,s+5,1,2,USD), cc(s+1,s+5,2,3,USD), cc(s+1,s+5,3,4,USD), cc(s+1,s+5,4,5,PCT),
    cc(totalRow,totalRow+1,1,2,USD), cc(totalRow,totalRow+1,2,3,USD),
    cc(totalRow,totalRow+1,3,4,USD), cc(totalRow,totalRow+1,4,5,PCT),
    // Column widths
    cw(0,1,240), cw(1,2,115), cw(2,3,115), cw(3,4,115), cw(4,5,90), cw(5,6,300),
  ]}})
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const params = parseArgs()
  const { dry, year, month, monthName, tabName } = params
  const { start, end } = monthRange(year, month)

  console.log(`\n🧮  thrml Monthly Close Reconciler`)
  console.log(`    Period : ${monthName} ${year}  (${start} → ${end})`)
  console.log(`    Mode   : ${dry?"DRY RUN — no writes":"LIVE — writing to Finance Tracker"}`)
  console.log(`    Tab    : "${tabName}"\n`)

  const { sheets } = initAuth()

  // Pull all data
  console.log("📊 Pulling Finance Tracker data...")
  const [platform, fixed, adhoc, opex] = await Promise.all([
    pullPlatformSpend(sheets, year, month),
    pullFixedCosts(sheets),
    pullAdHocCosts(sheets, year, month),
    pullOpExForecast(sheets),
  ])

  // Guard — no actuals yet
  if (platform.total===0 && adhoc.total===0) {
    console.warn(`\n⚠️  No actuals found for ${monthName} ${year}.`)
    console.warn(`   This is normal on the 1st — update Finance Tracker actuals and re-run.\n`)
    if (dry) { console.log("Dry run complete."); return }
  }

  // Preview
  const adBudget = CONFIG.AD_BUDGET_MONTHLY
  const adjusted = Math.max(0, platform.total - platform.credits - adhoc.credits)
  const total    = adjusted + fixed.total + adhoc.total
  const forecast = adBudget + opex.total
  const variance = total - forecast

  console.log(`\n📋 Reconciliation preview:`)
  console.log(`   Ad Spend gross       : $${platform.total.toFixed(2)}`)
  console.log(`   Credits / Adjustments: -$${(platform.credits+adhoc.credits).toFixed(2)}`)
  console.log(`   Ad Spend net         : $${adjusted.toFixed(2)}`)
  console.log(`   Fixed Costs          : $${fixed.total.toFixed(2)}`)
  console.log(`   Ad Hoc Costs         : $${adhoc.total.toFixed(2)}`)
  console.log(`   ──────────────────────────────`)
  console.log(`   Total Actual         : $${total.toFixed(2)}`)
  console.log(`   Total Forecast       : $${forecast.toFixed(2)}`)
  console.log(`   Variance             : ${variance>=0?"▲ $":"▼ -$"}${Math.abs(variance).toFixed(2)} ${variance>0?"over":"under"} budget`)
  console.log(`   Status               : ${variance>0?"🔴 OVER BUDGET":"🟢 ON/UNDER BUDGET"}\n`)

  if (dry) { console.log("✅ Dry run complete — no writes."); return }

  // Create tab inside Finance Tracker (no Drive file creation, no quota issues)
  console.log(`📄 Setting up tab in Finance Tracker...`)
  const sid = await getOrCreateTab(sheets, CONFIG.FINANCE_TRACKER, tabName)

  // Write report
  console.log(`\n✍️  Writing reconciliation data...`)
  const result = await writeReport(sheets, sid, params,
    { platform, fixed, adhoc, opex, adBudget })

  // Format
  console.log(`🎨 Applying formatting...`)
  await applyFormatting(sheets, sid, result.sRows, result.summary.isOverBudget)

  // Update index
  console.log(`📑 Updating Close Index...`)
  await upsertCloseIndex(sheets, CONFIG.FINANCE_TRACKER, params, result.summary)

  console.log(`\n✅  Monthly close complete`)
  console.log(`    Sheet  : https://docs.google.com/spreadsheets/d/${CONFIG.FINANCE_TRACKER}`)
  console.log(`    Tab    : "${tabName}"`)
  console.log(`    Rows   : ${result.rowCount}`)
  console.log(`    Status : ${result.summary.isOverBudget?"🔴 OVER BUDGET":"🟢 UNDER BUDGET"}\n`)
}

main().catch(e => {
  console.error(`\n❌ Reconciler failed: ${e.message}`)
  if (process.env.CI) process.exit(1)
})
