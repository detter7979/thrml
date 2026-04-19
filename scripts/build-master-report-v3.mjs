/**
 * thrml Master Report v3 — Complete Rebuild
 * - Reorder Platform Data columns (analytical dims first)
 * - Add formula-driven columns: Year, Month, Week, Targeting Name
 * - Highlight formula columns
 * - Rebuild Performance Report: Overall + Host + Guest sections with CAC
 * - Split Creative Performance → Host Creative + Guest Creative
 * - Delete Ad Performance tab
 * - Apply USD currency + number formatting to all pivots
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json","utf8"))
const auth = new google.auth.GoogleAuth({ credentials:creds, scopes:["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version:"v4", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── NEW Platform Data column order (0-based) ──────────────────────────────
// Analytical dims first, then hierarchy, then creative, then metrics
const NEW_HEADERS = [
  "Date","Year","Month","Week",                        // 0-3   time dims (B,C,D = formula)
  "Platform",                                          // 4
  "Phase","Campaign Objective","Funnel Stage",         // 5-7
  "Opt. Event",                                        // 8
  "Audience Group","Targeting Name","Geo",             // 9-11  (K=formula VLOOKUP)
  "Space Type","Targeting Tactic","Placement",         // 12-14
  "Campaign ID","Campaign Name",                       // 15-16
  "Ad Set ID","Ad Set Name",                           // 17-18
  "Ad ID","Ad Name",                                   // 19-20
  "Angle","Format Type","Length","Aspect Ratio","CTA", // 21-25
  "Hook Copy",                                         // 26
  "Spend ($)","Impressions","Reach","Link Clicks",     // 27-30
  "become_host_click","host_onboarding_started",       // 31-32
  "listing_created","Purchase","Video Views 100%",     // 33-35
]

// OLD column indices (from current Platform Data)
const OLD = {
  date:0,year:1,month:2,week:3,platform:4,
  campId:5,asId:6,adId:7,campName:8,asName:9,adName:10,
  phase:11,campObj:12,funnel:13,audGroup:14,tgtName:15,geo:16,
  spaceType:17,tgtTactic:18,placement:19,
  angle:20,fmtType:21,length:22,ratio:23,cta:24,hook:25,optEvent:26,
  spend:27,imps:28,reach:29,clicks:30,
  bhc:31,hos:32,lc:33,pur:34,vv100:35,
}

// NEW column indices after reorder
const COL = {
  date:0,year:1,month:2,week:3,platform:4,
  phase:5,campObj:6,funnel:7,optEvent:8,
  audGroup:9,tgtName:10,geo:11,
  spaceType:12,tgtTactic:13,placement:14,
  campId:15,campName:16,asId:17,asName:18,adId:19,adName:20,
  angle:21,fmtType:22,length:23,ratio:24,cta:25,hook:26,
  spend:27,imps:28,reach:29,clicks:30,
  bhc:31,hos:32,lc:33,pur:34,vv100:35,
}

// Column letter from 0-based index
const colLetter = n => n < 26 ? String.fromCharCode(65+n) : `A${String.fromCharCode(65+n-26)}`

// ── Number formats ────────────────────────────────────────────────────────
const FMT = {
  usd:  { numberFormat: { type:"CURRENCY", pattern:'"$"#,##0.00' } },
  int:  { numberFormat: { type:"NUMBER",   pattern:"#,##0" } },
  pct:  { numberFormat: { type:"PERCENT",  pattern:"0.00%" } },
  date: { numberFormat: { type:"DATE",     pattern:"yyyy-mm-dd" } },
}

// ── Colours ───────────────────────────────────────────────────────────────
const C = {
  titleBg:    { red:0.047, green:0.086, blue:0.157 },
  navy:       { red:0.078, green:0.133, blue:0.216 },
  sectionBg:  { red:0.133, green:0.196, blue:0.298 },
  hostBg:     { red:0.086, green:0.220, blue:0.180 },  // deep teal for host
  guestBg:    { red:0.220, green:0.133, blue:0.314 },  // deep purple for guest
  overallBg:  { red:0.157, green:0.196, blue:0.271 },  // overall section
  white:      { red:1, green:1, blue:1 },
  accent:     { red:0.651, green:0.761, blue:0.894 },
  formulaHL:  { red:0.949, green:0.976, blue:0.902 },  // light green — formula cells
  totalBg:    { red:0.094, green:0.094, blue:0.094 },
}

// ── Formatting helpers ────────────────────────────────────────────────────
const rng   = (sid,r1,r2,c1,c2) => ({sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cFmt  = (sid,r1,r2,c1,c2,fmt) => ({repeatCell:{range:rng(sid,r1,r2,c1,c2),cell:{userEnteredFormat:fmt},fields:Object.keys(fmt).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw    = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
const rh    = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"ROWS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
const frz   = (sid,rows,cols=0) => ({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:rows,frozenColumnCount:cols}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})
const merge = (sid,r1,r2,c1,c2) => ({mergeCells:{range:rng(sid,r1,r2,c1,c2),mergeType:"MERGE_ALL"}})

// ── Pivot table builder ────────────────────────────────────────────────────
function makePivot(targetSid, srcSid, anchorRow, anchorCol, rowCols, valueCols, filterSpecs=[]) {
  return {
    updateCells: {
      start: {sheetId:targetSid, rowIndex:anchorRow, columnIndex:anchorCol},
      rows: [{values:[{pivotTable:{
        source: {sheetId:srcSid,startRowIndex:0,startColumnIndex:0,endRowIndex:1000,endColumnIndex:36},
        rows: rowCols.map(o=>({sourceColumnOffset:o, showTotals:true, sortOrder:"ASCENDING"})),
        values: valueCols,
        filterSpecs,
      }}]}],
      fields:"pivotTable",
    }
  }
}

// ── Standard metric value defs — no format here (applied via column formatting after)
const ALL_METRICS = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM", name:"become_host_click"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM", name:"host_onboarding_started"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM", name:"listing_created"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM", name:"Purchase"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM", name:"Video Views 100%"},
]
const SPEND_METRICS = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
]
const HOST_METRICS = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM", name:"Host Clicks (P1)"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM", name:"Onboarding Started (P2)"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM", name:"Listings Created (P3)"},
]
const GUEST_METRICS = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM", name:"New Bookings"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM", name:"Video Views 100%"},
]

// Apply column-level number formatting to pivot sheets
// Spend = col B (idx 1), all other metrics = cols C+ (idx 2+)
function pivotNumFmtReqs(sid) {
  return [
    // Col B = Spend ($) → USD in all data rows (rows 4 onward)
    cFmt(sid,3,500,1,2,FMT.usd),
    // Cols C–I = integer metrics
    cFmt(sid,3,500,2,10,FMT.int),
  ]
}

// ── Filter specs using visibleValues (only supported method in pivot filterSpecs)
const fHost    = {filterCriteria:{visibleValues:["Host"]},   columnOffsetIndex:COL.audGroup}
const fGuest   = {filterCriteria:{visibleValues:["Guest"]},  columnOffsetIndex:COL.audGroup}
const fProsp   = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]}, columnOffsetIndex:COL.funnel}
const fRT      = {filterCriteria:{visibleValues:["Retargeting"]}, columnOffsetIndex:COL.funnel}

// ── Section title label writer ─────────────────────────────────────────────
// Builds a sparse row array with labels at exact positions
function buildLabelRows(title, subtitle, sections, totalRows=300) {
  const arr = Array.from({length:totalRows}, ()=>[""])
  arr[0] = [title]; arr[1] = [subtitle ?? ""]; arr[2] = [""]
  for (const s of sections) arr[s.labelRow] = [s.label]
  let last = arr.length-1
  while(last>3 && arr[last][0]==="") last--
  return arr.slice(0, last+3)
}

// Format: title block + section labels (colour varies by sectionType)
function buildSectionFmts(sid, numCols, sections) {
  const reqs = [
    frz(sid,3,1),
    cFmt(sid,0,1,0,numCols,{backgroundColor:C.titleBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:16}, verticalAlignment:"MIDDLE", padding:{top:14,bottom:14}}),
    cFmt(sid,1,2,0,numCols,{backgroundColor:C.navy, textFormat:{foregroundColor:C.accent,italic:true,fontSize:10}, horizontalAlignment:"RIGHT"}),
    cFmt(sid,2,3,0,numCols,{backgroundColor:C.navy}),
    rh(sid,0,1,48), rh(sid,1,2,22), rh(sid,2,3,8),
  ]
  for (const s of sections) {
    const bg = s.type==="host" ? C.hostBg : s.type==="guest" ? C.guestBg : C.overallBg
    reqs.push(cFmt(sid,s.labelRow,s.labelRow+1,0,numCols,{
      backgroundColor:bg,
      textFormat:{foregroundColor:C.white,bold:true,fontSize:s.big?13:11},
      verticalAlignment:"MIDDLE", padding:{top:s.big?10:7,bottom:s.big?10:7}
    }))
    reqs.push(rh(sid,s.labelRow,s.labelRow+1,s.big?36:28))
  }
  return reqs
}

// ── KPI / CAC formula rows (non-pivot, uses SUMIF from Platform Data) ───────
// Returns array of [ [label, formula, formula, formula] ] rows for a given audience group
// Anchored at a specific sheet row (rowStart = 1-based sheet row)
function cacRows(audGroup, rowStart, pdTab="Platform Data") {
  const PD  = `'${pdTab}'`
  const AUD = `${PD}!${colLetter(COL.audGroup)}:${colLetter(COL.audGroup)}`
  const met = (col) => `IFERROR(SUMIF(${AUD},"${audGroup}",${PD}!${colLetter(col)}:${colLetter(col)}),0)`
  const isHost = audGroup==="Host"
  const r = rowStart
  // Row r: spend, r+1: primary conv, r+2: secondary conv, r+3: tertiary conv, r+4: cac1, r+5: cac2, r+6: cac3
  if(isHost) return [
    ["Total Ad Spend",              `=${met(COL.spend)}`,                                    "", ""],
    ["Host Clicks (P1 events)",     `=${met(COL.bhc)}`,                                      "", ""],
    ["Host Onboarding (P2 events)", `=${met(COL.hos)}`,                                      "", ""],
    ["Listings Created (P3 events)",`=${met(COL.lc)}`,                                       "", ""],
    ["","","",""],
    ["CAC — Host Click",            `=IFERROR(B${r}/B${r+1},"—")`,                           "", "Cost per P1 event"],
    ["CAC — Onboarding Started",    `=IFERROR(B${r}/B${r+2},"—")`,                           "", "Cost per P2 event"],
    ["CAC — Listing Created",       `=IFERROR(B${r}/B${r+3},"—")`,                           "", "Cost per P3 event"],
  ]
  return [
    ["Total Ad Spend",              `=${met(COL.spend)}`,                                    "", ""],
    ["New Bookings (Purchase)",      `=${met(COL.pur)}`,                                      "", ""],
    ["Link Clicks",                 `=${met(COL.clicks)}`,                                    "", ""],
    ["Impressions",                 `=${met(COL.imps)}`,                                      "", ""],
    ["","","",""],
    ["CAC — New Booking",           `=IFERROR(B${r}/B${r+1},"—")`,                           "", "Cost per Purchase"],
    ["CPC (Cost per Click)",        `=IFERROR(B${r}/B${r+2},"—")`,                           "", "Cost per link click"],
    ["CPM (Cost per 1k Impr.)",     `=IFERROR(B${r}/B${r+3}*1000,"—")`,                      "", ""],
  ]
}

// ── Format KPI table block ─────────────────────────────────────────────────
function kpiFmtReqs(sid, rowStart, numRows, isHost) {
  const reqs = []
  const hdrBg = isHost ? {red:0.122,green:0.306,blue:0.259} : {red:0.306,green:0.188,blue:0.427}
  // Spend cell = dollar format, conversion cells = int, CAC cells = dollar
  reqs.push(cFmt(sid,rowStart,rowStart+1,   1,2,{...FMT.usd, backgroundColor:{red:0.97,green:0.99,blue:0.97}}))
  reqs.push(cFmt(sid,rowStart+1,rowStart+4, 1,2,{...FMT.int, backgroundColor:{red:0.97,green:0.99,blue:0.97}}))
  reqs.push(cFmt(sid,rowStart+5,rowStart+8, 1,2,{...FMT.usd, backgroundColor:{red:0.97,green:0.99,blue:0.97}, textFormat:{bold:true}}))
  // Label column
  for(let r=rowStart; r<rowStart+numRows; r++) {
    reqs.push(cFmt(sid,r,r+1,0,1,{textFormat:{fontSize:10}, backgroundColor:{red:0.97,green:0.99,blue:0.97}}))
    reqs.push(cFmt(sid,r,r+1,3,4,{textFormat:{fontSize:9,italic:true,foregroundColor:{red:0.5,green:0.5,blue:0.5}}}))
  }
  return reqs
}

// ── STEP 1: Rebuild Platform Data with new column order + formulas ─────────
async function rebuildPlatformData(SRC) {
  console.log("  Reading existing Platform Data...")
  const raw = await sheets.spreadsheets.values.get({
    spreadsheetId:MASTER, range:"Platform Data!A1:AJ1000", valueRenderOption:"UNFORMATTED_VALUE"
  })
  const rows = raw.data.values ?? []
  if(rows.length<2) { console.log("  ⚠️  Platform Data empty"); return }

  const oldHdrs = rows[0]
  const dataRows = rows.slice(1)
  console.log(`  Reordering ${dataRows.length} data rows...`)

  // Map: new column position → old column position
  const newToOld = [
    OLD.date, OLD.year, OLD.month, OLD.week, OLD.platform,
    OLD.phase, OLD.campObj, OLD.funnel, OLD.optEvent,
    OLD.audGroup, OLD.tgtName, OLD.geo,
    OLD.spaceType, OLD.tgtTactic, OLD.placement,
    OLD.campId, OLD.campName, OLD.asId, OLD.asName, OLD.adId, OLD.adName,
    OLD.angle, OLD.fmtType, OLD.length, OLD.ratio, OLD.cta, OLD.hook,
    OLD.spend, OLD.imps, OLD.reach, OLD.clicks,
    OLD.bhc, OLD.hos, OLD.lc, OLD.pur, OLD.vv100,
  ]

  // Build reordered rows with formulas for computed columns
  // Row 1 in sheet = header, data starts at sheet row 2 (1-based)
  const outRows = dataRows.map((oldRow, idx) => {
    const sheetRow = idx + 2  // sheet row number (1-based)
    const newRow = newToOld.map(oldIdx => oldRow[oldIdx] ?? "")
    // Replace computed columns with formulas
    newRow[COL.year]    = `=YEAR(A${sheetRow})`
    newRow[COL.month]   = `=TEXT(A${sheetRow},"Mmm")`
    newRow[COL.week]    = `=CONCATENATE("Week ",ISOWEEKNUM(A${sheetRow})," (",TEXT(A${sheetRow}-WEEKDAY(A${sheetRow},2)+1,"MM/DD")," - ",TEXT(A${sheetRow}-WEEKDAY(A${sheetRow},2)+7,"MM/DD/YY"),")")`
    newRow[COL.tgtName] = `=IFERROR(VLOOKUP(${colLetter(COL.spaceType)}${sheetRow},'Targeting Lookup'!$A:$B,2,FALSE),${colLetter(COL.spaceType)}${sheetRow})`
    return newRow
  })

  // Write header + data
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Platform Data!A1:AJ1000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[NEW_HEADERS, ...outRows]}
  })
  console.log(`  ✅ Platform Data reordered: ${outRows.length} rows, formulas applied`)

  // Apply formatting
  const fmtReqs = [
    frz(SRC,1,0),
    cFmt(SRC,0,1,0,36,{backgroundColor:{red:0.047,green:0.086,blue:0.157},textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    // Formula columns highlighted (Year=1, Month=2, Week=3, TgtName=10)
    cFmt(SRC,0,1,1,4,{backgroundColor:{red:0.6,green:0.85,blue:0.5},textFormat:{foregroundColor:{red:0.1,green:0.2,blue:0.1},bold:true,fontSize:10}}),
    cFmt(SRC,0,1,10,11,{backgroundColor:{red:0.6,green:0.85,blue:0.5},textFormat:{foregroundColor:{red:0.1,green:0.2,blue:0.1},bold:true,fontSize:10}}),
    cFmt(SRC,1,500,1,4,{backgroundColor:C.formulaHL}),
    cFmt(SRC,1,500,10,11,{backgroundColor:C.formulaHL}),
    // Date column format
    cFmt(SRC,1,500,0,1,{...FMT.date}),
    // Metrics number format
    cFmt(SRC,1,500,COL.spend,COL.spend+1,FMT.usd),
    cFmt(SRC,1,500,COL.imps,COL.vv100+1,FMT.int),
    // ID cols monospace tint
    cFmt(SRC,1,500,15,22,{backgroundColor:{red:0.94,green:0.92,blue:0.99},textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Column widths
    cw(SRC,0,1,100), cw(SRC,1,2,50), cw(SRC,2,3,50), cw(SRC,3,4,185),
    cw(SRC,4,5,70),
    cw(SRC,5,6,50), cw(SRC,6,7,110), cw(SRC,7,8,115), cw(SRC,8,9,170),
    cw(SRC,9,10,100), cw(SRC,10,11,170), cw(SRC,11,12,75),
    cw(SRC,12,13,90), cw(SRC,13,14,155), cw(SRC,14,15,130),
    cw(SRC,15,16,70), cw(SRC,16,17,240), cw(SRC,17,18,70), cw(SRC,18,19,250),
    cw(SRC,19,20,65), cw(SRC,20,21,160),
    cw(SRC,21,22,110), cw(SRC,22,23,80), cw(SRC,23,24,65), cw(SRC,24,25,85), cw(SRC,25,26,90),
    cw(SRC,26,27,195),
    cw(SRC,27,36,85),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:fmtReqs}})

  // Also sync to Finance Tracker (same column order)
  await sheets.spreadsheets.values.clear({spreadsheetId:FINANCE, range:"Platform Data!A1:AJ1000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:FINANCE, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[NEW_HEADERS, ...outRows]}
  })
  console.log("  ✅ Finance Tracker Platform Data synced")
}

// ── STEP 2: Rebuild Performance Report ────────────────────────────────────
async function buildPerformanceReport(PR_SID, SRC) {
  const NUM_COLS = 9

  // Section definitions — labelRow, pivotRow, type, label
  // Overall section
  const overallSecs = [
    {label:"▌ OVERALL  ·  By Platform",     labelRow:3,  pivotRow:4,  col:[COL.platform]},
    {label:"▌ OVERALL  ·  By Phase",         labelRow:14, pivotRow:15, col:[COL.phase]},
    {label:"▌ OVERALL  ·  By Funnel Stage",  labelRow:25, pivotRow:26, col:[COL.funnel]},
    {label:"▌ OVERALL  ·  By Audience Group",labelRow:36, pivotRow:37, col:[COL.audGroup]},
  ]

  // Host section — rows start at 50
  const HOST_BASE = 50
  const HOST_KPI_ROW  = HOST_BASE + 3   // sheet row for first KPI data row (1-based)
  // pivot rows within host section
  const hostSecs = [
    {label:"⬛ HOST PERFORMANCE",            labelRow:HOST_BASE,    big:true, type:"host"},
    {label:"▌ HOST  ·  KPIs & CAC",          labelRow:HOST_BASE+2,  type:"host"},
    // KPI table occupies HOST_BASE+3 to HOST_BASE+10 (8 rows)
    {label:"▌ HOST  ·  By Phase",            labelRow:HOST_BASE+12, type:"host"},
    {label:"▌ HOST  ·  Funnel Overview",     labelRow:HOST_BASE+22, type:"host"},
    {label:"▌ HOST  ·  Prospecting & Lookalike — By Targeting",labelRow:HOST_BASE+32,type:"host"},
    {label:"▌ HOST  ·  Retargeting — By Targeting",            labelRow:HOST_BASE+58,type:"host"},
  ]
  const hostPivotRows = {
    phase:      HOST_BASE+13,
    funnel:     HOST_BASE+23,
    prospTgtL:  HOST_BASE+33,  // Targeting Tactic + Targeting Name (Prospecting filter)
    rtTgtL:     HOST_BASE+59,  // Targeting Tactic + Targeting Name (Retargeting filter)
  }

  // Guest section — rows start at HOST_BASE+80
  const GUEST_BASE = HOST_BASE + 82
  const GUEST_KPI_ROW = GUEST_BASE + 3
  const guestSecs = [
    {label:"⬛ GUEST PERFORMANCE",           labelRow:GUEST_BASE,    big:true, type:"guest"},
    {label:"▌ GUEST  ·  KPIs & CAC",         labelRow:GUEST_BASE+2,  type:"guest"},
    {label:"▌ GUEST  ·  By Phase",           labelRow:GUEST_BASE+12, type:"guest"},
    {label:"▌ GUEST  ·  Funnel Overview",    labelRow:GUEST_BASE+22, type:"guest"},
    {label:"▌ GUEST  ·  Prospecting — By Targeting",labelRow:GUEST_BASE+32,type:"guest"},
    {label:"▌ GUEST  ·  Retargeting — By Targeting",labelRow:GUEST_BASE+58,type:"guest"},
  ]
  const guestPivotRows = {
    phase:      GUEST_BASE+13,
    funnel:     GUEST_BASE+23,
    prospTgtL:  GUEST_BASE+33,
    rtTgtL:     GUEST_BASE+59,
  }

  const allSections = [
    ...overallSecs.map(s=>({...s,type:"overall"})),
    ...hostSecs,
    ...guestSecs,
  ]

  // Build label rows
  const allLabelRows = buildLabelRows(
    "thrml — Performance Report",
    `=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`,
    allSections.map(s=>({label:s.label, labelRow:s.labelRow})),
    GUEST_BASE+90
  )

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Performance Report!A1:Z500"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:allLabelRows}
  })

  // KPI formula tables
  const hostKpiData  = cacRows("Host",  HOST_KPI_ROW)
  const guestKpiData = cacRows("Guest", GUEST_KPI_ROW)
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:`Performance Report!A${HOST_KPI_ROW}`,
    valueInputOption:"USER_ENTERED", requestBody:{values:hostKpiData}
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:`Performance Report!A${GUEST_KPI_ROW}`,
    valueInputOption:"USER_ENTERED", requestBody:{values:guestKpiData}
  })

  // ── Pivot tables ────────────────────────────────────────────────────────
  const pivotReqs = [
    // Overall
    ...overallSecs.map(s=>makePivot(PR_SID,SRC,s.pivotRow,0,s.col,ALL_METRICS)),
    // Host
    makePivot(PR_SID,SRC,hostPivotRows.phase,   0,[COL.phase],  HOST_METRICS,[fHost]),
    makePivot(PR_SID,SRC,hostPivotRows.funnel,  0,[COL.funnel], HOST_METRICS,[fHost]),
    makePivot(PR_SID,SRC,hostPivotRows.prospTgtL,0,[COL.tgtTactic,COL.tgtName],HOST_METRICS,[fHost,fProsp]),
    makePivot(PR_SID,SRC,hostPivotRows.rtTgtL,  0,[COL.tgtTactic,COL.tgtName], HOST_METRICS,[fHost,fRT]),
    // Guest
    makePivot(PR_SID,SRC,guestPivotRows.phase,  0,[COL.phase],  GUEST_METRICS,[fGuest]),
    makePivot(PR_SID,SRC,guestPivotRows.funnel, 0,[COL.funnel], GUEST_METRICS,[fGuest]),
    makePivot(PR_SID,SRC,guestPivotRows.prospTgtL,0,[COL.tgtTactic,COL.tgtName],GUEST_METRICS,[fGuest,fProsp]),
    makePivot(PR_SID,SRC,guestPivotRows.rtTgtL, 0,[COL.tgtTactic,COL.tgtName], GUEST_METRICS,[fGuest,fRT]),
  ]

  // ── Formatting ──────────────────────────────────────────────────────────
  const fmtReqs = [
    ...buildSectionFmts(PR_SID, NUM_COLS, allSections),
    ...kpiFmtReqs(PR_SID, HOST_KPI_ROW-1,  8, true),
    ...kpiFmtReqs(PR_SID, GUEST_KPI_ROW-1, 8, false),
    cw(PR_SID,0,1,255), cw(PR_SID,1,2,105), cw(PR_SID,2,3,115),
    cw(PR_SID,3,4,105), cw(PR_SID,4,5,140), cw(PR_SID,5,6,160),
    cw(PR_SID,6,7,120), cw(PR_SID,7,8,90), cw(PR_SID,8,9,130),
  ]

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER, requestBody:{requests:[...pivotReqs,...fmtReqs,...pivotNumFmtReqs(PR_SID)]}})
  console.log("  ✅ Performance Report: overall + host + guest sections")
}

// ── STEP 3: Build Host Creative + Guest Creative tabs ─────────────────────
async function buildCreativeTabs(tabMap, SRC) {
  const creativeSecs = [
    {label:"▌ BY ANGLE",          pivotRow:4,  col:COL.angle},
    {label:"▌ BY FORMAT TYPE",    pivotRow:18, col:COL.fmtType},
    {label:"▌ BY LENGTH",         pivotRow:30, col:COL.length},
    {label:"▌ BY ASPECT RATIO",   pivotRow:42, col:COL.ratio},
    {label:"▌ BY CTA",            pivotRow:54, col:COL.cta},
    {label:"▌ BY TARGETING NAME", pivotRow:66, col:COL.tgtName},
  ]
  const sectionRows = creativeSecs.map((s,i)=>({label:s.label,labelRow:s.pivotRow-1}))

  for (const [audLabel, filterSpec, tabTitle, type] of [
    ["Host",  fHost,  "Host Creative",  "host"],
    ["Guest", fGuest, "Guest Creative", "guest"],
  ]) {
    const sid = tabMap[tabTitle]
    if(!sid) { console.log(`  ⚠️  Tab "${tabTitle}" not found`); continue }

    const NUM_COLS = 9
    const titleRows = buildLabelRows(
      `thrml — ${tabTitle} Performance`,
      `=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`,
      sectionRows, 100
    )

    await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:`'${tabTitle}'!A1:Z300`})
    await sheets.spreadsheets.values.update({
      spreadsheetId:MASTER, range:`'${tabTitle}'!A1`,
      valueInputOption:"USER_ENTERED", requestBody:{values:titleRows}
    })

    const metrics = type==="host" ? HOST_METRICS : GUEST_METRICS
    const pivotReqs = creativeSecs.map(s=>makePivot(sid,SRC,s.pivotRow,0,[s.col],metrics,[filterSpec]))

    const bg = type==="host" ? C.hostBg : C.guestBg
    const fmtReqs = [
      frz(sid,3,1),
      cFmt(sid,0,1,0,NUM_COLS,{backgroundColor:C.titleBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cFmt(sid,1,2,0,NUM_COLS,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cFmt(sid,2,3,0,NUM_COLS,{backgroundColor:C.navy}),
      rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
      ...sectionRows.map(s=>cFmt(sid,s.labelRow,s.labelRow+1,0,NUM_COLS,{
        backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},
        verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}
      })),
      ...sectionRows.map(s=>rh(sid,s.labelRow,s.labelRow+1,28)),
      cw(sid,0,1,195),cw(sid,1,2,105),cw(sid,2,3,115),cw(sid,3,4,105),
      cw(sid,4,5,140),cw(sid,5,6,160),cw(sid,6,7,120),cw(sid,7,8,90),cw(sid,8,9,130),
    ]

    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER, requestBody:{requests:[...pivotReqs,...fmtReqs,...pivotNumFmtReqs(sid)]}})
    console.log(`  ✅ ${tabTitle}: 6 pivot tables (filtered to ${audLabel})`)
  }
}

// ── STEP 4: Rebuild Spend Breakdown with updated COL offsets + formatting ──
async function rebuildSpendBreakdown(SB_SID, SRC) {
  const spendSecs = [
    {label:"▌ BY PLATFORM", labelRow:3,  pivotRow:4,  col:COL.platform},
    {label:"▌ BY PHASE",    labelRow:14, pivotRow:15, col:COL.phase},
    {label:"▌ BY MONTH",    labelRow:25, pivotRow:26, col:COL.month},
    {label:"▌ BY WEEK",     labelRow:36, pivotRow:37, col:COL.week},
    {label:"▌ BY GEO",      labelRow:47, pivotRow:48, col:COL.geo},
    {label:"▌ BY DATE",     labelRow:57, pivotRow:58, col:COL.date},
  ]
  const NUM_COLS = 4

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:buildLabelRows("thrml — Spend Breakdown",`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`,spendSecs.map(s=>({label:s.label,labelRow:s.labelRow})),100)}
  })

  const pivotReqs = spendSecs.map(s=>makePivot(SB_SID,SRC,s.pivotRow,0,[s.col],SPEND_METRICS))
  const fmtReqs = [
    frz(SB_SID,3,1),
    cFmt(SB_SID,0,1,0,NUM_COLS,{backgroundColor:C.titleBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(SB_SID,1,2,0,NUM_COLS,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(SB_SID,2,3,0,NUM_COLS,{backgroundColor:C.navy}),
    rh(SB_SID,0,1,48),rh(SB_SID,1,2,22),rh(SB_SID,2,3,8),
    ...spendSecs.map(s=>cFmt(SB_SID,s.labelRow,s.labelRow+1,0,NUM_COLS,{backgroundColor:C.overallBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
    ...spendSecs.map(s=>rh(SB_SID,s.labelRow,s.labelRow+1,28)),
    cw(SB_SID,0,1,210),cw(SB_SID,1,2,115),cw(SB_SID,2,3,120),cw(SB_SID,3,4,110),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...pivotReqs,...fmtReqs,...pivotNumFmtReqs(SB_SID)]}})
  console.log("  ✅ Spend Breakdown: rebuilt with new column offsets")
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔄  thrml Master Report v3 — Full Rebuild\n")

  // ── Get tab metadata ────────────────────────────────────────────────────
  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  const SRC = tabMap["Platform Data"]
  console.log("Tabs:", Object.keys(tabMap).join(", "))

  // ── Delete Ad Performance ────────────────────────────────────────────────
  if(tabMap["Ad Performance"]) {
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      {deleteSheet:{sheetId:tabMap["Ad Performance"]}}
    ]}})
    delete tabMap["Ad Performance"]
    console.log("✅ Deleted 'Ad Performance'")
  }

  // ── Delete old Creative Performance (will be replaced by two tabs) ──────
  if(tabMap["Creative Performance"]) {
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      {deleteSheet:{sheetId:tabMap["Creative Performance"]}}
    ]}})
    delete tabMap["Creative Performance"]
    console.log("✅ Deleted 'Creative Performance' (replacing with Host/Guest split)")
  }

  // ── Add Host Creative + Guest Creative tabs ─────────────────────────────
  const tabsToAdd = ["Host Creative","Guest Creative"].filter(t=>!tabMap[t])
  if(tabsToAdd.length) {
    const r = await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:
      tabsToAdd.map((title,i)=>({addSheet:{properties:{title,index:i+2}}}))
    }})
    r.data.replies?.forEach(rep=>{
      if(rep.addSheet) tabMap[rep.addSheet.properties.title]=rep.addSheet.properties.sheetId
    })
    console.log("✅ Added tabs:", tabsToAdd.join(", "))
  }

  // ── 1. Rebuild Platform Data ────────────────────────────────────────────
  console.log("\n📊 Step 1: Platform Data — reorder + formulas...")
  await rebuildPlatformData(SRC)

  // ── 2. Rebuild Performance Report ──────────────────────────────────────
  console.log("\n📊 Step 2: Performance Report...")
  await buildPerformanceReport(tabMap["Performance Report"], SRC)

  // ── 3. Build Host + Guest Creative tabs ─────────────────────────────────
  console.log("\n📊 Step 3: Creative tabs (Host + Guest)...")
  await buildCreativeTabs(tabMap, SRC)

  // ── 4. Rebuild Spend Breakdown with new column offsets ─────────────────
  console.log("\n📊 Step 4: Spend Breakdown...")
  await rebuildSpendBreakdown(tabMap["Spend Breakdown"], SRC)

  // ── 5. Final tab reorder ─────────────────────────────────────────────────
  // Order: Performance Report | Host Creative | Guest Creative | Spend Breakdown | Targeting Lookup | Platform Data
  const finalOrder = ["Performance Report","Host Creative","Guest Creative","Spend Breakdown","Targeting Lookup","Platform Data"]
  const reorderReqs = finalOrder
    .filter(t=>tabMap[t]!==undefined)
    .map((t,i)=>({updateSheetProperties:{properties:{sheetId:tabMap[t],index:i},fields:"index"}}))
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:reorderReqs}})
  console.log("\n✅ Tab order set")

  // ── Final summary ────────────────────────────────────────────────────────
  const finalMeta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  console.log("\n📋 Final tabs:")
  finalMeta.data.sheets?.forEach((s,i)=>console.log(`  ${i+1}. ${s.properties.title}`))
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e=>{console.error("❌",e.message);process.exit(1)})
