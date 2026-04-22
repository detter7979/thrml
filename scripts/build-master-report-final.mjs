/**
 * thrml Master Report — Definitive Rebuild
 * Run: node build-master-report-final.mjs
 *
 * Column order for Platform Data:
 *   Date | Year* | Month* | Week* | Platform |
 *   Phase | Campaign ID | Campaign Name | Ad Set ID | Ad Set Name | Ad ID | Ad Name |
 *   Campaign Objective | Audience Group | Funnel Stage |
 *   Targeting Tactic | Targeting Name* | Geo |
 *   Angle | Format Type | Length | Aspect Ratio | CTA | Hook Copy |
 *   Spend ($) | Impressions | Reach | Link Clicks |
 *   become_host_click | host_onboarding_started | listing_created | Purchase | Video Views 100%
 *
 *   * = formula-driven column (highlighted green)
 *
 * Formula columns:
 *   Year        = =YEAR(A{row})
 *   Month       = =TEXT(A{row},"Mmm")
 *   Week        = =CONCATENATE("Week ",ISOWEEKNUM(A{row}), " (", ...)
 *   Targeting Name = =IFERROR(VLOOKUP(SpaceType,'Targeting Lookup'!$A:$B,2,FALSE), SpaceType)
 *     where SpaceType is derived from the Ad Set Name (parsed inline)
 */

import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth  = new google.auth.GoogleAuth({ credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER   = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// ── Definitive column layout ──────────────────────────────────────────────
const HEADERS = [
  "Date",              // A  0   hard value
  "Year",              // B  1   =YEAR(A)              ← formula
  "Month",             // C  2   =TEXT(A,"Mmm")        ← formula
  "Week",              // D  3   =CONCATENATE(...)      ← formula
  "Platform",          // E  4   hard value
  "Phase",             // F  5   hard value
  "Campaign ID",       // G  6   hard value
  "Campaign Name",     // H  7   hard value
  "Ad Set ID",         // I  8   hard value
  "Ad Set Name",       // J  9   hard value
  "Ad ID",             // K  10  hard value
  "Ad Name",           // L  11  hard value
  "Campaign Objective",// M  12  hard value
  "Audience Group",    // N  13  hard value
  "Funnel Stage",      // O  14  hard value
  "Targeting Tactic",  // P  15  hard value
  "Targeting Name",    // Q  16  =VLOOKUP(spaceType,'Targeting Lookup') ← formula
  "Geo",               // R  17  hard value
  "Angle",             // S  18  hard value
  "Format Type",       // T  19  hard value
  "Length",            // U  20  hard value
  "Aspect Ratio",      // V  21  hard value
  "CTA",               // W  22  hard value
  "Hook Copy",         // X  23  hard value
  "Spend ($)",         // Y  24  hard value
  "Impressions",       // Z  25  hard value
  "Reach",             // AA 26  hard value
  "Link Clicks",       // AB 27  hard value
  "become_host_click", // AC 28  hard value
  "host_onboarding_started",// AD 29 hard value
  "listing_created",   // AE 30  hard value
  "Purchase",          // AF 31  hard value
  "Video Views 100%",  // AG 32  hard value
]

// Formula column indices (0-based) — highlighted green
const FORMULA_COLS = [1, 2, 3, 16]  // Year, Month, Week, Targeting Name

// Pivot source column offsets (0-based, matching HEADERS above)
const COL = {
  date:0, year:1, month:2, week:3, platform:4,
  phase:5, campId:6, campName:7, asId:8, asName:9, adId:10, adName:11,
  campObj:12, audGroup:13, funnel:14, tgtTactic:15, tgtName:16, geo:17,
  angle:18, fmtType:19, length:20, ratio:21, cta:22, hook:23,
  spend:24, imps:25, reach:26, clicks:27,
  bhc:28, hos:29, lc:30, pur:31, vv100:32,
}

// ── Helpers ───────────────────────────────────────────────────────────────
const C = {
  ink:    { red:0.047, green:0.086, blue:0.157 },
  navy:   { red:0.078, green:0.133, blue:0.216 },
  secBg:  { red:0.133, green:0.196, blue:0.298 },
  hostBg: { red:0.067, green:0.216, blue:0.176 },
  gstBg:  { red:0.200, green:0.118, blue:0.298 },
  white:  { red:1, green:1, blue:1 },
  accent: { red:0.651, green:0.761, blue:0.894 },
  fmlHL:  { red:0.851, green:0.953, blue:0.776 },  // formula highlight
  fmlHdr: { red:0.271, green:0.655, blue:0.169 },  // formula header
  idBg:   { red:0.941, green:0.918, blue:0.988 },  // ID cols
  total:  { red:0.094, green:0.094, blue:0.094 },
}
const rng  = (s,r1,r2,c1,c2)=>({sheetId:s,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cFmt = (s,r1,r2,c1,c2,f)=>({repeatCell:{range:rng(s,r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const rh   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"ROWS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const frz  = (s,r,c=0)=>({updateSheetProperties:{properties:{sheetId:s,gridProperties:{frozenRowCount:r,frozenColumnCount:c}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})
const USD  = {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}}
const INT  = {numberFormat:{type:"NUMBER",pattern:"#,##0"}}
const DATE = {numberFormat:{type:"DATE",pattern:"yyyy-mm-dd"}}

// ── Week formula ──────────────────────────────────────────────────────────
const weekFormula = (row) =>
  `=CONCATENATE("Week ",ISOWEEKNUM(A${row})," (",` +
  `TEXT(A${row}-WEEKDAY(A${row},2)+1,"MM/DD")," - ",` +
  `TEXT(A${row}-WEEKDAY(A${row},2)+7,"MM/DD/YY"),")")`

// ── Targeting Name formula (VLOOKUP from space type parsed from Ad Set Name) ─
// Ad Set Name format: CampName_spaceType_audSrc_placement
// spaceType is token index after CampName (7 tokens), so position 7
// We extract it with a SPLIT/INDEX combo in Sheets
const tgtNameFormula = (row) =>
  `=IFERROR(VLOOKUP(INDEX(SPLIT(J${row},"_"),1,8),'Targeting Lookup'!$A:$B,2,FALSE),` +
  `INDEX(SPLIT(J${row},"_"),1,8))`

// ── Pivot builder ─────────────────────────────────────────────────────────
function pivot(tSid, srcSid, row, rowCols, vals, filters=[]) {
  return {
    updateCells: {
      start: {sheetId:tSid, rowIndex:row, columnIndex:0},
      rows: [{values:[{pivotTable:{
        source: {sheetId:srcSid,startRowIndex:0,startColumnIndex:0,endRowIndex:2000,endColumnIndex:HEADERS.length},
        rows: rowCols.map(o=>({sourceColumnOffset:o,showTotals:true,sortOrder:"ASCENDING"})),
        values: vals,
        filterSpecs: filters,
      }}]}],
      fields: "pivotTable",
    }
  }
}

const hostFilter  = {filterCriteria:{visibleValues:["Host"]},  columnOffsetIndex:COL.audGroup}
const guestFilter = {filterCriteria:{visibleValues:["Guest"]}, columnOffsetIndex:COL.audGroup}
const prospFilter = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]}, columnOffsetIndex:COL.funnel}
const rtFilter    = {filterCriteria:{visibleValues:["Retargeting"]}, columnOffsetIndex:COL.funnel}

const ALL_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM", name:"become_host_click"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM", name:"host_onboarding_started"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM", name:"listing_created"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM", name:"Purchase"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM", name:"Video Views 100%"},
]
const SPD_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
]
const HST_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM", name:"Host Clicks (P1)"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM", name:"Onboarding (P2)"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM", name:"Listings Created (P3)"},
]
const GST_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM", name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM", name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM", name:"Link Clicks"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM", name:"New Bookings"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM", name:"Video Views 100%"},
]

// Format: first value col (spend) = USD, rest = INT
function numFmt(sid) {
  return [
    cFmt(sid,3,2000,1,2,USD),   // col B = Spend always USD
    cFmt(sid,3,2000,2,12,INT),  // cols C+ = INT
  ]
}

// ── Label rows builder (sparse) ───────────────────────────────────────────
function labelRows(title, sections, totalRows=300) {
  const arr = Array.from({length:totalRows}, ()=>[""])
  arr[0]=[title]
  arr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  arr[2]=[""]
  for (const s of sections) arr[s.row]=[s.label]
  let last=arr.length-1
  while(last>3 && arr[last][0]==="") last--
  return arr.slice(0,last+3)
}

function sectionFmts(sid, numCols, sections) {
  const r=[]
  r.push(frz(sid,3,1))
  r.push(cFmt(sid,0,1,0,numCols,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}))
  r.push(cFmt(sid,1,2,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}))
  r.push(cFmt(sid,2,3,0,numCols,{backgroundColor:C.navy}))
  r.push(rh(sid,0,1,48)); r.push(rh(sid,1,2,22)); r.push(rh(sid,2,3,8))
  for (const s of sections) {
    const bg = s.t==="host" ? C.hostBg : s.t==="guest" ? C.gstBg : C.secBg
    r.push(cFmt(sid,s.row,s.row+1,0,numCols,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:s.big?13:11},verticalAlignment:"MIDDLE",padding:{top:s.big?10:7,bottom:s.big?10:7}}))
    r.push(rh(sid,s.row,s.row+1,s.big?36:28))
  }
  return r
}

// ── KPI formula block ─────────────────────────────────────────────────────
// Returns rows for a CAC table anchored at sheetRow (1-based)
function kpiRows(audGroup, sheetRow) {
  const PD = "'Platform Data'"
  const AG = `${PD}!N:N`  // Audience Group col N
  const sum = (col)=>`IFERROR(SUMIF(${AG},"${audGroup}",${PD}!${col}:${col}),0)`
  const r = sheetRow
  if (audGroup==="Host") return [
    ["Total Ad Spend",               `=${sum("Y")}`,                           "", "Ad spend attributed to Host campaigns"],
    ["Host Clicks (P1 events)",      `=${sum("AC")}`,                          "", "become_host_click conversions"],
    ["Host Onboarding (P2 events)",  `=${sum("AD")}`,                          "", "host_onboarding_started conversions"],
    ["Listings Created (P3 events)", `=${sum("AE")}`,                          "", "listing_created conversions"],
    ["","","",""],
    ["CAC — Host Click",             `=IFERROR(B${r}/B${r+1},"—")`,            "", "Cost per P1 event"],
    ["CAC — Onboarding Started",     `=IFERROR(B${r}/B${r+2},"—")`,            "", "Cost per P2 event"],
    ["CAC — Listing Created",        `=IFERROR(B${r}/B${r+3},"—")`,            "", "Cost per P3 event"],
  ]
  return [
    ["Total Ad Spend",               `=${sum("Y")}`,                           "", "Ad spend attributed to Guest campaigns"],
    ["New Bookings (Purchase)",       `=${sum("AF")}`,                          "", "Purchase conversions"],
    ["Link Clicks",                  `=${sum("AB")}`,                          "", ""],
    ["Impressions",                  `=${sum("Z")}`,                           "", ""],
    ["","","",""],
    ["CAC — New Booking",            `=IFERROR(B${r}/B${r+1},"—")`,            "", "Cost per Purchase"],
    ["CPC (Cost per Click)",         `=IFERROR(B${r}/B${r+2},"—")`,            "", "Cost per link click"],
    ["CPM (per 1k Impressions)",     `=IFERROR(B${r}/B${r+3}*1000,"—")`,       "", ""],
  ]
}

async function main() {
  console.log("\n🔄  thrml Master Report — Definitive Rebuild\n")

  // ── Fetch tab map ────────────────────────────────────────────────────────
  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  console.log("Current tabs:", Object.keys(tabMap).join(", "))

  // ── 1. Load Namer data ──────────────────────────────────────────────────
  console.log("\n📖 Loading Namer data...")
  const [cbR,asR,crR] = await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Campaign Builder!A2:L20"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Ad Set Builder!A2:J30"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Creative Builder!A2:Q25"}),
  ])
  const camps     = (cbR.data.values??[]).filter(r=>r[0])
  const adsets    = (asR.data.values??[]).filter(r=>r[0])
  const creatives = (crR.data.values??[]).filter(r=>r[0])
  console.log(`   ${camps.length} campaigns | ${adsets.length} ad sets | ${creatives.length} ads`)

  // ── 2. Ensure Reference Table tab ───────────────────────────────────────
  if (!tabMap["Reference Table"]) {
    const r = await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      {addSheet:{properties:{title:"Reference Table",index:5}}}
    ]}})
    tabMap["Reference Table"] = r.data.replies[0].addSheet.properties.sheetId
    console.log("✅ Created 'Reference Table' tab")
  }
  const RT_SID = tabMap["Reference Table"]

  // Build reference rows: Campaign + AdSet + Ad cross-reference
  const refHdrs = ["Campaign ID","Campaign Name","Phase","Objective","Funnel","Audience Group","Geo","Event",
                   "Ad Set ID","Ad Set Name","Space Type","Audience Src","Placement",
                   "Ad ID","Ad Name","Concept","Format","Length","Size","CTA","Conv. Event"]
  const campMap  = Object.fromEntries(camps.map(r=>  [r[0],r]))
  const adsetMap = Object.fromEntries(adsets.map(r=> [r[0],r]))

  const refRows = []
  for (const cr of creatives) {
    const [adId,asId,campId,,concept,fmt,len,size,,cta,adName,,,,,,event] = cr
    const as  = adsetMap[asId]  ?? []
    const c   = campMap[campId] ?? []
    refRows.push([
      campId, c[8]??campId, c[2]??"",c[4]??"",c[3]??"",c[6]??"",c[7]??"",c[9]??"",
      asId, as[7]??asId, as[3]??"",as[4]??"",as[5]??"",
      adId, adName??adId, concept??"",fmt??"",len??"",size??"",cta??"",event??""
    ])
  }

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Reference Table!A1:V200"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Reference Table!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:[refHdrs,...refRows]}})

  // Format Reference Table
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    frz(RT_SID,1,1),
    cFmt(RT_SID,0,1,0,refHdrs.length,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    cFmt(RT_SID,1,500,0,3,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}),
    cFmt(RT_SID,1,500,8,9,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}),
    cFmt(RT_SID,1,500,13,14,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}),
    cw(RT_SID,0,1,75),cw(RT_SID,1,2,240),cw(RT_SID,2,3,50),cw(RT_SID,3,4,100),cw(RT_SID,4,5,100),
    cw(RT_SID,5,6,90),cw(RT_SID,6,7,75),cw(RT_SID,7,8,170),
    cw(RT_SID,8,9,70),cw(RT_SID,9,10,255),cw(RT_SID,10,11,85),cw(RT_SID,11,12,90),cw(RT_SID,12,13,110),
    cw(RT_SID,13,14,65),cw(RT_SID,14,15,160),cw(RT_SID,15,16,100),cw(RT_SID,16,17,75),
    cw(RT_SID,17,18,65),cw(RT_SID,18,19,75),cw(RT_SID,19,20,85),cw(RT_SID,20,21,170),
  ]}})
  console.log(`✅ Reference Table: ${refRows.length} rows`)

  // ── 3. Rebuild Platform Data ─────────────────────────────────────────────
  console.log("\n📊 Step 3: Platform Data rebuild...")
  // Read current live data — use UNFORMATTED_VALUE to get raw numbers
  const pdRaw = await sheets.spreadsheets.values.get({
    spreadsheetId:MASTER, range:"Platform Data!A1:AG2000",
    valueRenderOption:"UNFORMATTED_VALUE"
  })
  const pdRows = pdRaw.data.values ?? []
  const oldHdrs = pdRows[0] ?? []
  console.log(`   Current headers: ${oldHdrs.slice(0,8).join(" | ")}...`)
  console.log(`   Current rows: ${pdRows.length-1}`)

  // Build a lookup from old header name → old column index
  const oldIdx = {}
  oldHdrs.forEach((h,i)=>oldIdx[h]=i)
  console.log("   Mapped old cols:", Object.keys(oldIdx).slice(0,10).join(", "))

  // Hard values to extract from existing data (by original header name)
  // Map new column → old header name
  const colMap = {
    "Date":                  "Date",
    "Platform":              "Platform",
    "Phase":                 "Phase",
    "Campaign ID":           "Campaign ID",
    "Campaign Name":         "Campaign Name",
    "Ad Set ID":             "Ad Set ID",
    "Ad Set Name":           "Ad Set Name",
    "Ad ID":                 "Ad ID",
    "Ad Name":               "Ad Name",
    "Campaign Objective":    "Campaign Objective",
    "Audience Group":        "Audience Group",
    "Funnel Stage":          "Funnel Stage",
    "Targeting Tactic":      "Targeting Tactic",
    "Geo":                   "Geo",
    "Angle":                 "Angle",
    "Format Type":           "Format Type",
    "Length":                "Length",
    "Aspect Ratio":          "Aspect Ratio",
    "CTA":                   "CTA",
    "Hook Copy":             "Hook Copy",
    "Spend ($)":             "Spend ($)",
    "Impressions":           "Impressions",
    "Reach":                 "Reach",
    "Link Clicks":           "Link Clicks",
    "become_host_click":     "become_host_click",
    "host_onboarding_started":"host_onboarding_started",
    "listing_created":       "listing_created",
    "Purchase":              "Purchase",
    "Video Views 100%":      "Video Views 100%",
  }

  const dataRows = pdRows.slice(1)
  const outRows = dataRows.map((oldRow, idx) => {
    const sheetRow = idx + 2  // sheet row number (1-based, header is row 1)
    const get = (hdr) => {
      const i = oldIdx[hdr]
      return (i !== undefined && oldRow[i] !== undefined && oldRow[i] !== "") ? oldRow[i] : ""
    }
    return [
      get("Date"),               // A  Date (numeric serial if from Google Sheets)
      `=YEAR(A${sheetRow})`,     // B  Year — formula
      `=TEXT(A${sheetRow},"Mmm")`,// C Month — formula
      weekFormula(sheetRow),     // D  Week — formula
      get("Platform"),           // E
      get("Phase"),              // F
      get("Campaign ID"),        // G
      get("Campaign Name"),      // H
      get("Ad Set ID"),          // I
      get("Ad Set Name"),        // J
      get("Ad ID"),              // K
      get("Ad Name"),            // L
      get("Campaign Objective"), // M
      get("Audience Group"),     // N
      get("Funnel Stage"),       // O
      get("Targeting Tactic"),   // P
      tgtNameFormula(sheetRow),  // Q  Targeting Name — formula (from Ad Set Name col J)
      get("Geo"),                // R
      get("Angle"),              // S
      get("Format Type"),        // T
      get("Length"),             // U
      get("Aspect Ratio"),       // V
      get("CTA"),                // W
      get("Hook Copy"),          // X
      get("Spend ($)"),          // Y
      get("Impressions"),        // Z
      get("Reach"),              // AA
      get("Link Clicks"),        // AB
      get("become_host_click"),  // AC
      get("host_onboarding_started"),// AD
      get("listing_created"),    // AE
      get("Purchase"),           // AF
      get("Video Views 100%"),   // AG
    ]
  })

  const SRC = tabMap["Platform Data"]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Platform Data!A1:AG2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS,...outRows]}
  })
  console.log(`   ✅ Platform Data written: ${outRows.length} rows, ${HEADERS.length} columns`)

  // Format Platform Data
  const pdFmtReqs = [
    frz(SRC,1,0),
    // Header — dark
    cFmt(SRC,0,1,0,HEADERS.length,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    // Formula column HEADERS — green
    ...FORMULA_COLS.map(c=>cFmt(SRC,0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}})),
    // Formula column DATA — light green highlight
    ...FORMULA_COLS.map(c=>cFmt(SRC,1,2000,c,c+1,{backgroundColor:C.fmlHL})),
    // Date col format
    cFmt(SRC,1,2000,0,1,DATE),
    // Spend = USD
    cFmt(SRC,1,2000,COL.spend,COL.spend+1,USD),
    // Metric cols = INT
    cFmt(SRC,1,2000,COL.imps,HEADERS.length,INT),
    // ID cols tint (G,H,I,J,K,L = cols 6-11)
    cFmt(SRC,1,2000,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Column widths
    cw(SRC,0,1,100),  // Date
    cw(SRC,1,2,50),   // Year
    cw(SRC,2,3,50),   // Month
    cw(SRC,3,4,185),  // Week
    cw(SRC,4,5,70),   // Platform
    cw(SRC,5,6,50),   // Phase
    cw(SRC,6,7,75),   // Campaign ID
    cw(SRC,7,8,240),  // Campaign Name
    cw(SRC,8,9,75),   // Ad Set ID
    cw(SRC,9,10,255), // Ad Set Name
    cw(SRC,10,11,65), // Ad ID
    cw(SRC,11,12,160),// Ad Name
    cw(SRC,12,13,115),// Campaign Objective
    cw(SRC,13,14,100),// Audience Group
    cw(SRC,14,15,115),// Funnel Stage
    cw(SRC,15,16,155),// Targeting Tactic
    cw(SRC,16,17,170),// Targeting Name
    cw(SRC,17,18,75), // Geo
    cw(SRC,18,19,110),// Angle
    cw(SRC,19,20,80), // Format Type
    cw(SRC,20,21,65), // Length
    cw(SRC,21,22,85), // Aspect Ratio
    cw(SRC,22,23,90), // CTA
    cw(SRC,23,24,195),// Hook Copy
    cw(SRC,24,33,85), // Metrics
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:pdFmtReqs}})
  console.log("   ✅ Platform Data formatted")

  // Sync to Finance Tracker too
  await sheets.spreadsheets.values.clear({spreadsheetId:FINANCE,range:"Platform Data!A1:AG2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:FINANCE, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS,...outRows]}
  })
  console.log("   ✅ Finance Tracker Platform Data synced")

  // ── 4. Rebuild Performance Report ────────────────────────────────────────
  console.log("\n📊 Step 4: Performance Report...")
  const PR_SID = tabMap["Performance Report"]

  // Section layout — generous spacing so pivots don't overlap
  const HB = 52   // Host base row (0-based)
  const GB = 140  // Guest base row
  const prSecs = [
    {row:3,  label:"▌ OVERALL  ·  By Platform",      t:"overall"},
    {row:12, label:"▌ OVERALL  ·  By Phase",           t:"overall"},
    {row:21, label:"▌ OVERALL  ·  By Funnel Stage",    t:"overall"},
    {row:30, label:"▌ OVERALL  ·  By Audience Group",  t:"overall"},
    {row:HB,   label:"⬛  HOST PERFORMANCE",            t:"host",big:true},
    {row:HB+2, label:"▌ HOST  ·  KPIs & CAC",          t:"host"},
    {row:HB+12,label:"▌ HOST  ·  By Phase",             t:"host"},
    {row:HB+21,label:"▌ HOST  ·  By Funnel Stage",      t:"host"},
    {row:HB+30,label:"▌ HOST  ·  Prospecting — Targeting Tactic × Targeting Name", t:"host"},
    {row:HB+55,label:"▌ HOST  ·  Retargeting — Targeting Tactic × Targeting Name", t:"host"},
    {row:GB,   label:"⬛  GUEST PERFORMANCE",           t:"guest",big:true},
    {row:GB+2, label:"▌ GUEST  ·  KPIs & CAC",          t:"guest"},
    {row:GB+12,label:"▌ GUEST  ·  By Phase",             t:"guest"},
    {row:GB+21,label:"▌ GUEST  ·  By Funnel Stage",      t:"guest"},
    {row:GB+30,label:"▌ GUEST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"guest"},
    {row:GB+55,label:"▌ GUEST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"guest"},
  ]

  const prLabels = labelRows("thrml — Performance Report", prSecs.map(s=>({row:s.row,label:s.label})), GB+90)
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Performance Report!A1:Z500"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:prLabels}
  })

  // KPI tables
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:`Performance Report!A${HB+3+1}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:kpiRows("Host",HB+3+1)}
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:`Performance Report!A${GB+3+1}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:kpiRows("Guest",GB+3+1)}
  })

  const prPivots = [
    pivot(PR_SID,SRC, 4,  [COL.platform],  ALL_MET),
    pivot(PR_SID,SRC, 13, [COL.phase],     ALL_MET),
    pivot(PR_SID,SRC, 22, [COL.funnel],    ALL_MET),
    pivot(PR_SID,SRC, 31, [COL.audGroup],  ALL_MET),
    // Host
    pivot(PR_SID,SRC, HB+13,[COL.phase],   HST_MET,[hostFilter]),
    pivot(PR_SID,SRC, HB+22,[COL.funnel],  HST_MET,[hostFilter]),
    pivot(PR_SID,SRC, HB+31,[COL.tgtTactic,COL.tgtName],HST_MET,[hostFilter,prospFilter]),
    pivot(PR_SID,SRC, HB+56,[COL.tgtTactic,COL.tgtName],HST_MET,[hostFilter,rtFilter]),
    // Guest
    pivot(PR_SID,SRC, GB+13,[COL.phase],   GST_MET,[guestFilter]),
    pivot(PR_SID,SRC, GB+22,[COL.funnel],  GST_MET,[guestFilter]),
    pivot(PR_SID,SRC, GB+31,[COL.tgtTactic,COL.tgtName],GST_MET,[guestFilter,prospFilter]),
    pivot(PR_SID,SRC, GB+56,[COL.tgtTactic,COL.tgtName],GST_MET,[guestFilter,rtFilter]),
  ]

  const prFmts = [
    ...sectionFmts(PR_SID,9,prSecs),
    ...numFmt(PR_SID),
    // KPI table formatting — host
    cFmt(PR_SID,HB+3,HB+7, 1,2,{...USD,textFormat:{bold:false}}),
    cFmt(PR_SID,HB+7,HB+11,1,2,{...USD,textFormat:{bold:true}}),
    // KPI table formatting — guest
    cFmt(PR_SID,GB+3,GB+7, 1,2,{...USD,textFormat:{bold:false}}),
    cFmt(PR_SID,GB+7,GB+11,1,2,{...USD,textFormat:{bold:true}}),
    cw(PR_SID,0,1,255),cw(PR_SID,1,2,105),cw(PR_SID,2,3,115),cw(PR_SID,3,4,105),
    cw(PR_SID,4,5,140),cw(PR_SID,5,6,155),cw(PR_SID,6,7,120),cw(PR_SID,7,8,90),cw(PR_SID,8,9,130),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...prPivots,...prFmts]}})
  console.log("   ✅ Performance Report: 12 pivots + KPI tables")

  // ── 5. Rebuild creative tabs (Host + Guest) ───────────────────────────────
  console.log("\n📊 Step 5: Creative tabs...")
  const crSecs = [
    {row:3,  col:COL.angle,   label:"▌ BY ANGLE"},
    {row:17, col:COL.fmtType, label:"▌ BY FORMAT TYPE"},
    {row:28, col:COL.length,  label:"▌ BY LENGTH"},
    {row:39, col:COL.ratio,   label:"▌ BY ASPECT RATIO"},
    {row:50, col:COL.cta,     label:"▌ BY CTA"},
    {row:62, col:COL.tgtName, label:"▌ BY TARGETING NAME"},
  ]

  for (const [tabTitle, filt, met, t] of [
    ["Host Creative",  hostFilter,  HST_MET, "host"],
    ["Guest Creative", guestFilter, GST_MET, "guest"],
  ]) {
    const sid = tabMap[tabTitle]
    if (!sid) { console.log(`  ⚠️  '${tabTitle}' not found`); continue }

    const crLabels = labelRows(`thrml — ${tabTitle}`,crSecs.map(s=>({row:s.row,label:s.label})),100)
    await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:`'${tabTitle}'!A1:Z300`})
    await sheets.spreadsheets.values.update({
      spreadsheetId:MASTER,range:`'${tabTitle}'!A1`,
      valueInputOption:"USER_ENTERED",requestBody:{values:crLabels}
    })

    const crPivots = crSecs.map(s=>pivot(sid,SRC,s.row+1,[s.col],met,[filt]))
    const bg = t==="host"?C.hostBg:C.gstBg
    const crFmts = [
      frz(sid,3,1),
      cFmt(sid,0,1,0,9,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cFmt(sid,1,2,0,9,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cFmt(sid,2,3,0,9,{backgroundColor:C.navy}),
      rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
      ...crSecs.map(s=>cFmt(sid,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
      ...crSecs.map(s=>rh(sid,s.row,s.row+1,28)),
      ...numFmt(sid),
      cw(sid,0,1,190),cw(sid,1,2,105),cw(sid,2,3,115),cw(sid,3,4,105),
      cw(sid,4,5,140),cw(sid,5,6,155),cw(sid,6,7,120),cw(sid,7,8,90),cw(sid,8,9,130),
    ]
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...crPivots,...crFmts]}})
    console.log(`   ✅ ${tabTitle}: 6 pivot tables`)
  }

  // ── 6. Rebuild Spend Breakdown ────────────────────────────────────────────
  console.log("\n📊 Step 6: Spend Breakdown...")
  const SB_SID = tabMap["Spend Breakdown"]
  const sbSecs = [
    {row:3,  col:COL.platform, label:"▌ BY PLATFORM"},
    {row:13, col:COL.phase,    label:"▌ BY PHASE"},
    {row:23, col:COL.month,    label:"▌ BY MONTH"},
    {row:33, col:COL.week,     label:"▌ BY WEEK"},
    {row:43, col:COL.geo,      label:"▌ BY GEO"},
    {row:52, col:COL.date,     label:"▌ BY DATE"},
  ]
  const sbLabels = labelRows("thrml — Spend Breakdown",sbSecs.map(s=>({row:s.row,label:s.label})),100)
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:sbLabels}
  })
  const sbPivots = sbSecs.map(s=>pivot(SB_SID,SRC,s.row+1,[s.col],SPD_MET))
  const sbFmts = [
    frz(SB_SID,3,1),
    cFmt(SB_SID,0,1,0,4,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(SB_SID,1,2,0,4,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(SB_SID,2,3,0,4,{backgroundColor:C.navy}),
    rh(SB_SID,0,1,48),rh(SB_SID,1,2,22),rh(SB_SID,2,3,8),
    ...sbSecs.map(s=>cFmt(SB_SID,s.row,s.row+1,0,4,{backgroundColor:C.secBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
    ...sbSecs.map(s=>rh(SB_SID,s.row,s.row+1,28)),
    ...numFmt(SB_SID),
    cw(SB_SID,0,1,210),cw(SB_SID,1,2,115),cw(SB_SID,2,3,120),cw(SB_SID,3,4,110),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...sbPivots,...sbFmts]}})
  console.log("   ✅ Spend Breakdown: 6 pivots")

  // ── 7. Reorder tabs ───────────────────────────────────────────────────────
  const finalOrder = ["Performance Report","Host Creative","Guest Creative","Spend Breakdown","Targeting Lookup","Reference Table","Platform Data"]
  const freshMeta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const freshMap = Object.fromEntries(freshMeta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  const reorders = finalOrder.filter(t=>freshMap[t]!==undefined).map((t,i)=>({
    updateSheetProperties:{properties:{sheetId:freshMap[t],index:i},fields:"index"}
  }))
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:reorders}})

  const finalMeta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  console.log("\n📋 Final tab order:")
  finalMeta.data.sheets?.forEach((s,i)=>console.log(`  ${i+1}. ${s.properties.title}`))
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e=>{console.error("❌",e.message);process.exit(1)})
