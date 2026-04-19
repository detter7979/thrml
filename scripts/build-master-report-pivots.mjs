/**
 * thrml — Master Report: Native Pivot Tables v2 (fixed row placement)
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const MASTER = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"

// Platform Data column offsets (0-based)
const COL = {
  date:0, year:1, month:2, week:3, platform:4,
  campId:5, asId:6, adId:7, campName:8, asName:9, adName:10,
  phase:11, campObj:12, funnel:13, audGroup:14, tgtName:15,
  geo:16, spaceType:17, tgtTactic:18, placement:19,
  angle:20, fmtType:21, length:22, ratio:23, cta:24,
  hook:25, optEvent:26,
  spend:27, imps:28, reach:29, clicks:30,
  bhc:31, hos:32, lc:33, pur:34, vv100:35,
}

const METRIC_VALUES = [
  { sourceColumnOffset: COL.spend,  summarizeFunction: "SUM", name: "Spend ($)" },
  { sourceColumnOffset: COL.imps,   summarizeFunction: "SUM", name: "Impressions" },
  { sourceColumnOffset: COL.clicks, summarizeFunction: "SUM", name: "Link Clicks" },
  { sourceColumnOffset: COL.bhc,    summarizeFunction: "SUM", name: "become_host_click" },
  { sourceColumnOffset: COL.hos,    summarizeFunction: "SUM", name: "host_onboarding_started" },
  { sourceColumnOffset: COL.lc,     summarizeFunction: "SUM", name: "listing_created" },
  { sourceColumnOffset: COL.pur,    summarizeFunction: "SUM", name: "Purchase" },
  { sourceColumnOffset: COL.vv100,  summarizeFunction: "SUM", name: "Video Views 100%" },
]

const SPEND_VALUES = [
  { sourceColumnOffset: COL.spend,  summarizeFunction: "SUM", name: "Spend ($)" },
  { sourceColumnOffset: COL.imps,   summarizeFunction: "SUM", name: "Impressions" },
  { sourceColumnOffset: COL.clicks, summarizeFunction: "SUM", name: "Link Clicks" },
]

// Colours
const C = {
  titleBg:   { red:0.047, green:0.086, blue:0.157 },
  navy:      { red:0.078, green:0.133, blue:0.216 },
  sectionBg: { red:0.133, green:0.196, blue:0.298 },
  white:     { red:1, green:1, blue:1 },
  accent:    { red:0.651, green:0.761, blue:0.894 },
}

// Helpers
const rng = (sid,r1,r2,c1,c2) => ({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cellFmt = (sid,r1,r2,c1,c2,fmt) => ({repeatCell:{range:rng(sid,r1,r2,c1,c2),cell:{userEnteredFormat:fmt},fields:Object.keys(fmt).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw  = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
const rh  = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"ROWS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
const frz = (sid,rows,cols=0) => ({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:rows,frozenColumnCount:cols}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})

// Build a sparse value array — put labels at EXACT row positions with empty rows in between
function buildLabelRows(titleText, sections, totalRows = 200) {
  const arr = Array.from({ length: totalRows }, () => [""])
  arr[0] = [titleText]
  arr[1] = [`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  arr[2] = [""]
  for (const s of sections) {
    arr[s.labelRow] = [s.label]
  }
  // Trim trailing empty rows
  let last = arr.length - 1
  while (last > 3 && arr[last][0] === "") last--
  return arr.slice(0, last + 2)
}

// Create pivot table at a cell anchor
function pivotReq(targetSid, srcSid, anchorRow, anchorCol, rowCols, valueCols) {
  return {
    updateCells: {
      start: { sheetId: targetSid, rowIndex: anchorRow, columnIndex: anchorCol },
      rows: [{
        values: [{
          pivotTable: {
            source: {
              sheetId: srcSid,
              startRowIndex: 0, startColumnIndex: 0,
              endRowIndex: 1000, endColumnIndex: 36,
            },
            rows: rowCols.map(offset => ({
              sourceColumnOffset: offset, showTotals: true, sortOrder: "ASCENDING",
            })),
            values: valueCols,
          }
        }]
      }],
      fields: "pivotTable",
    }
  }
}

// Format: title + section labels
function buildFmtReqs(sid, numCols, sections) {
  const reqs = [
    frz(sid, 3, 1),
    cellFmt(sid,0,1,0,numCols,{ backgroundColor:C.titleBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:16}, verticalAlignment:"MIDDLE", padding:{top:14,bottom:14} }),
    cellFmt(sid,1,2,0,numCols,{ backgroundColor:C.navy, textFormat:{foregroundColor:C.accent,italic:true,fontSize:10}, horizontalAlignment:"RIGHT" }),
    cellFmt(sid,2,3,0,numCols,{ backgroundColor:C.navy }),
    rh(sid,0,1,48), rh(sid,1,2,22), rh(sid,2,3,8),
  ]
  for (const s of sections) {
    reqs.push(cellFmt(sid,s.labelRow,s.labelRow+1,0,numCols,{
      backgroundColor:C.sectionBg,
      textFormat:{foregroundColor:C.white,bold:true,fontSize:11},
      verticalAlignment:"MIDDLE", padding:{top:7,bottom:7}
    }))
    reqs.push(rh(sid,s.labelRow,s.labelRow+1,30))
  }
  return reqs
}

async function main() {
  console.log("\n🔄  Building Master Report pivot tables v2\n")

  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER })
  const tabMap = Object.fromEntries(meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))
  const SRC = tabMap["Platform Data"]
  const T = {
    perf:     tabMap["Performance Report"],
    adPerf:   tabMap["Ad Performance"],
    spend:    tabMap["Spend Breakdown"],
    creative: tabMap["Creative Performance"],
    lookup:   tabMap["Targeting Lookup"],
    platData: tabMap["Platform Data"],
  }

  // ── 1. PERFORMANCE REPORT ──────────────────────────────────────────────
  // Spacing: 3 rows per section (label + pivot expands naturally)
  // Give each pivot 12 rows of breathing room
  const perfSecs = [
    { label:"▌ BY PLATFORM",       labelRow:3,  pivotRow:4,  col:COL.platform  },
    { label:"▌ BY PHASE",           labelRow:15, pivotRow:16, col:COL.phase     },
    { label:"▌ BY FUNNEL STAGE",    labelRow:27, pivotRow:28, col:COL.funnel    },
    { label:"▌ BY AUDIENCE GROUP",  labelRow:39, pivotRow:40, col:COL.audGroup  },
    { label:"▌ BY FORMAT TYPE",     labelRow:51, pivotRow:52, col:COL.fmtType   },
    { label:"▌ BY CAMPAIGN",        labelRow:63, pivotRow:64, col:COL.campName  },
  ]
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER, range:"Performance Report!A1:Z300" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{ values: buildLabelRows("thrml — Performance Report", perfSecs, 100) }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{ requests:[
    ...perfSecs.map(s => pivotReq(T.perf, SRC, s.pivotRow, 0, [s.col], METRIC_VALUES)),
    ...buildFmtReqs(T.perf, 9, perfSecs),
    cw(T.perf,0,1,255), cw(T.perf,1,2,100), cw(T.perf,2,3,115), cw(T.perf,3,4,100),
    cw(T.perf,4,5,135), cw(T.perf,5,6,160), cw(T.perf,6,7,120), cw(T.perf,7,8,90), cw(T.perf,8,9,125),
  ]}})
  console.log("✅ Performance Report — 6 pivots")

  // ── 2. AD PERFORMANCE ─────────────────────────────────────────────────
  const adSecs = [{ label:"▌ BY AD (Ad ID → Ad Name → Campaign ID)", labelRow:3, pivotRow:4 }]
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER, range:"Ad Performance!A1:Z200" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Ad Performance!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{ values: buildLabelRows("thrml — Ad Performance", adSecs, 10) }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{ requests:[
    pivotReq(T.adPerf, SRC, 4, 0, [COL.adId, COL.adName, COL.campId], METRIC_VALUES),
    ...buildFmtReqs(T.adPerf, 11, adSecs),
    cw(T.adPerf,0,1,70), cw(T.adPerf,1,2,175), cw(T.adPerf,2,3,75),
    cw(T.adPerf,3,4,100), cw(T.adPerf,4,5,115), cw(T.adPerf,5,6,100),
    cw(T.adPerf,6,7,135), cw(T.adPerf,7,8,155), cw(T.adPerf,8,9,120),
    cw(T.adPerf,9,10,90), cw(T.adPerf,10,11,125),
  ]}})
  console.log("✅ Ad Performance — 1 pivot")

  // ── 3. SPEND BREAKDOWN ────────────────────────────────────────────────
  const spendSecs = [
    { label:"▌ BY PLATFORM", labelRow:3,  pivotRow:4,  col:COL.platform },
    { label:"▌ BY PHASE",    labelRow:14, pivotRow:15, col:COL.phase    },
    { label:"▌ BY MONTH",    labelRow:25, pivotRow:26, col:COL.month    },
    { label:"▌ BY WEEK",     labelRow:36, pivotRow:37, col:COL.week     },
    { label:"▌ BY GEO",      labelRow:47, pivotRow:48, col:COL.geo      },
    { label:"▌ BY DATE",     labelRow:57, pivotRow:58, col:COL.date     },
  ]
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER, range:"Spend Breakdown!A1:Z300" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{ values: buildLabelRows("thrml — Spend Breakdown", spendSecs, 100) }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{ requests:[
    ...spendSecs.map(s => pivotReq(T.spend, SRC, s.pivotRow, 0, [s.col], SPEND_VALUES)),
    ...buildFmtReqs(T.spend, 4, spendSecs),
    cw(T.spend,0,1,210), cw(T.spend,1,2,110), cw(T.spend,2,3,115), cw(T.spend,3,4,105),
  ]}})
  console.log("✅ Spend Breakdown — 6 pivots")

  // ── 4. CREATIVE PERFORMANCE ───────────────────────────────────────────
  const creativeSecs = [
    { label:"▌ BY ANGLE",          labelRow:3,  pivotRow:4,  col:COL.angle   },
    { label:"▌ BY FORMAT TYPE",    labelRow:19, pivotRow:20, col:COL.fmtType },
    { label:"▌ BY LENGTH",         labelRow:31, pivotRow:32, col:COL.length  },
    { label:"▌ BY ASPECT RATIO",   labelRow:43, pivotRow:44, col:COL.ratio   },
    { label:"▌ BY CTA",            labelRow:55, pivotRow:56, col:COL.cta     },
    { label:"▌ BY TARGETING NAME", labelRow:68, pivotRow:69, col:COL.tgtName },
  ]
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER, range:"Creative Performance!A1:Z300" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Creative Performance!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{ values: buildLabelRows("thrml — Creative Performance", creativeSecs, 110) }
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{ requests:[
    ...creativeSecs.map(s => pivotReq(T.creative, SRC, s.pivotRow, 0, [s.col], METRIC_VALUES)),
    ...buildFmtReqs(T.creative, 9, creativeSecs),
    cw(T.creative,0,1,200), cw(T.creative,1,2,100), cw(T.creative,2,3,115),
    cw(T.creative,3,4,100), cw(T.creative,4,5,135), cw(T.creative,5,6,160),
    cw(T.creative,6,7,120), cw(T.creative,7,8,90),  cw(T.creative,8,9,125),
  ]}})
  console.log("✅ Creative Performance — 6 pivots")

  // ── 5. Move Platform Data to last ─────────────────────────────────────
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{ requests:[
    { updateSheetProperties:{ properties:{sheetId:T.platData, index:5}, fields:"index" } },
  ]}})
  console.log("✅ Platform Data → last tab")

  const final = await sheets.spreadsheets.get({ spreadsheetId: MASTER })
  console.log("\n📋 Final tab order:")
  final.data.sheets?.forEach((s,i) => console.log(`  ${i+1}. ${s.properties.title}`))
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
