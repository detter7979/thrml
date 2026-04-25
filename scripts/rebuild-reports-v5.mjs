/**
 * thrml Reports Rebuild v5
 * - Performance Report: clean layout, overall calc metrics, fix all gaps
 * - Creative tabs: add summary calc metrics block
 * - Drive files: last 30 days consolidated into single Raw + Cleaned files
 */
import { google } from "googleapis"
import { readFileSync } from "fs"
const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json","utf8"))
const auth  = new google.auth.GoogleAuth({ credentials:creds,
  scopes:["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive"] })
const sheets = google.sheets({ version:"v4", auth })
const drive  = google.drive({ version:"v3", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER   = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"
const RAW_ROOT     = "15FIxUe7411b3hzPEB7AzRlQgYRt9EzGo"
const CLEANED_ROOT = "1yjIh556CkkQxWZ8oq_mZFtKKISVn1n6b"

const HEADERS = [
  "Date","Year","Month","Week","Platform",
  "Phase","Campaign ID","Campaign Name","Ad Set ID","Ad Set Name","Ad ID","Ad Name",
  "Campaign Objective","Audience Group","Funnel Stage",
  "Targeting Tactic","Targeting Name","Geo",
  "Angle","Format Type","Length","Aspect Ratio","CTA","Hook Copy","Opt. Event",
  "Spend ($)","Impressions","Reach","Link Clicks",
  "become_host_click","host_onboarding_started","listing_created",
  "checkout_initiated","Purchase","Video Views 100%",
]
const N = HEADERS.length // 35
const COL = {
  date:0,year:1,month:2,week:3,platform:4,
  phase:5,campId:6,campName:7,asId:8,asName:9,adId:10,adName:11,
  campObj:12,audGroup:13,funnel:14,tgtTactic:15,tgtName:16,geo:17,
  angle:18,fmtType:19,length:20,ratio:21,cta:22,hook:23,optEvent:24,
  spend:25,imps:26,reach:27,clicks:28,
  bhc:29,hos:30,lc:31,ci:32,pur:33,vv100:34,
}

// ── Colours + format helpers ──────────────────────────────────────────────
const C = {
  ink:    {red:0.047,green:0.086,blue:0.157},
  navy:   {red:0.078,green:0.133,blue:0.216},
  secBg:  {red:0.133,green:0.196,blue:0.298},
  hostBg: {red:0.067,green:0.216,blue:0.176},
  gstBg:  {red:0.200,green:0.118,blue:0.298},
  allBg:  {red:0.169,green:0.188,blue:0.251},   // overall calc block header
  rawHdr: {red:0.231,green:0.290,blue:0.420},
  white:  {red:1,green:1,blue:1},
  accent: {red:0.651,green:0.761,blue:0.894},
  fmlHL:  {red:0.851,green:0.953,blue:0.776},
  fmlHdr: {red:0.200,green:0.620,blue:0.100},
  idBg:   {red:0.941,green:0.918,blue:0.988},
  calcRow:{red:0.961,green:0.965,blue:0.976},
  calcAlt:{red:0.984,green:0.984,blue:0.984},
}
const rng  = (s,r1,r2,c1,c2)=>({sheetId:s,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cFmt = (s,r1,r2,c1,c2,f)=>({repeatCell:{range:rng(s,r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const rh   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"ROWS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const frz  = (s,r,c=0)=>({updateSheetProperties:{properties:{sheetId:s,gridProperties:{frozenRowCount:r,frozenColumnCount:c}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})
const USD  = {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}}
const INT  = {numberFormat:{type:"NUMBER",pattern:"#,##0"}}
const PCT  = {numberFormat:{type:"PERCENT",pattern:"0.00%"}}
const DEC2 = {numberFormat:{type:"NUMBER",pattern:"#,##0.00"}}
const GRY  = {textFormat:{italic:true,foregroundColor:{red:0.5,green:0.5,blue:0.5},fontSize:9}}
const DATE_F = {numberFormat:{type:"DATE",pattern:"yyyy-mm-dd"}}

// Pivot
function piv(tSid,srcSid,row,rowCols,vals,filters=[]) {
  return {updateCells:{
    start:{sheetId:tSid,rowIndex:row,columnIndex:0},
    rows:[{values:[{pivotTable:{
      source:{sheetId:srcSid,startRowIndex:0,startColumnIndex:0,endRowIndex:2000,endColumnIndex:N},
      rows:rowCols.map(o=>({sourceColumnOffset:o,showTotals:true,sortOrder:"ASCENDING"})),
      values:vals,filterSpecs:filters,
    }}]}],
    fields:"pivotTable",
  }}
}

const hostF  = {filterCriteria:{visibleValues:["Host"]},  columnOffsetIndex:COL.audGroup}
const guestF = {filterCriteria:{visibleValues:["Guest"]}, columnOffsetIndex:COL.audGroup}
const prospF = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]},columnOffsetIndex:COL.funnel}
const rtF    = {filterCriteria:{visibleValues:["Retargeting"]},columnOffsetIndex:COL.funnel}

const ALL_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM",name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM",name:"become_host_click"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM",name:"host_onboarding_started"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM",name:"listing_created"},
  {sourceColumnOffset:COL.ci,     summarizeFunction:"SUM",name:"checkout_initiated"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM",name:"Purchase"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM",name:"Video Views 100%"},
]
const HST_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM",name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
  {sourceColumnOffset:COL.bhc,    summarizeFunction:"SUM",name:"Host Clicks (P1)"},
  {sourceColumnOffset:COL.hos,    summarizeFunction:"SUM",name:"Onboarding (P2)"},
  {sourceColumnOffset:COL.lc,     summarizeFunction:"SUM",name:"Listings Created (P3)"},
]
const GST_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM",name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
  {sourceColumnOffset:COL.ci,     summarizeFunction:"SUM",name:"Checkout Initiated"},
  {sourceColumnOffset:COL.pur,    summarizeFunction:"SUM",name:"Purchase (New Booking)"},
  {sourceColumnOffset:COL.vv100,  summarizeFunction:"SUM",name:"Video Views 100%"},
]
const SPD_MET = [
  {sourceColumnOffset:COL.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
  {sourceColumnOffset:COL.imps,   summarizeFunction:"SUM",name:"Impressions"},
  {sourceColumnOffset:COL.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
]

// ── SUMIF helpers ─────────────────────────────────────────────────────────
const PD = "'Platform Data'"
const sAll  = (col)=>`=IFERROR(SUMPRODUCT((${PD}!A2:A2000<>"")*ISNUMBER(${PD}!${col}2:${col}2000)*(${PD}!${col}2:${col}2000)),0)`
const sAud  = (aud,col)=>`=IFERROR(SUMIF(${PD}!N:N,"${aud}",${PD}!${col}:${col}),0)`

// ── Calculated metrics block builders ─────────────────────────────────────
// OVERALL — all campaigns combined
function buildOverallCalc(startRow) {
  const r = startRow
  return [
    ["OVERALL ENGAGEMENT & COST METRICS","Value","Benchmark","Notes"],
    ["Total Spend ($)",        sAll("Z"),                                  "",""],
    ["Impressions",            sAll("AA"),                                 "",""],
    ["Link Clicks",            sAll("AC"),                                 "",""],
    ["Host Events (P1+P2+P3)", `=IFERROR(${sAll("AD").slice(1)}+${sAll("AE").slice(1)}+${sAll("AF").slice(1)},0)`,"",""],
    ["Guest Bookings",         sAll("AH"),                                 "","Purchase"],
    ["Video Views 100%",       sAll("AI"),                                 "",""],
    ["","","",""],
    ["CTR  (Clicks ÷ Impressions)", `=IFERROR(B${r+3}/B${r+2},0)`,        "1.50%",""],
    ["CPC  (Spend ÷ Clicks)",       `=IFERROR(B${r+1}/B${r+3},0)`,        "$1.50",""],
    ["CPM  (Spend ÷ Imps × 1,000)", `=IFERROR(B${r+1}/B${r+2}*1000,0)`,  "$10.00","Per 1k impressions"],
    ["Blended CVR  (Purchase ÷ Clicks)",`=IFERROR(B${r+5}/B${r+3},0)`,   "2.00%","Overall click-to-booking"],
    ["Blended CPA  (Spend ÷ Purchase)", `=IFERROR(B${r+1}/B${r+5},0)`,   "$80.00","Blended cost per booking"],
  ]
}

// HOST
function buildHostCalc(startRow) {
  const r = startRow
  return [
    ["HOST CALCULATED METRICS","Value","Benchmark","Notes"],
    ["Spend ($)",                      sAud("Host","Z"),                  "","Total host ad spend"],
    ["Impressions",                    sAud("Host","AA"),                 "",""],
    ["Link Clicks",                    sAud("Host","AC"),                 "",""],
    ["Host Clicks (P1)",               sAud("Host","AD"),                 "","become_host_click"],
    ["Onboarding Started (P2)",        sAud("Host","AE"),                 "","host_onboarding_started"],
    ["Listings Created (P3)",          sAud("Host","AF"),                 "","listing_created"],
    ["","","",""],
    ["CTR  (Clicks ÷ Impressions)",    `=IFERROR(B${r+3}/B${r+2},0)`,    "1.50%",""],
    ["CPC  (Spend ÷ Clicks)",          `=IFERROR(B${r+1}/B${r+3},0)`,    "$1.50",""],
    ["CVR P1  (Host Clicks ÷ Clicks)", `=IFERROR(B${r+4}/B${r+3},0)`,    "8.00%",""],
    ["CVR P2  (Onboarding ÷ P1)",      `=IFERROR(B${r+5}/B${r+4},0)`,    "40.00%",""],
    ["CVR P3  (Listings ÷ Onboarding)",`=IFERROR(B${r+6}/B${r+5},0)`,    "20.00%",""],
    ["CAC — Host Click",               `=IFERROR(B${r+1}/B${r+4},0)`,    "$12.00","Spend ÷ P1 events"],
    ["CAC — Onboarding Started",       `=IFERROR(B${r+1}/B${r+5},0)`,    "$30.00","Spend ÷ P2 events"],
    ["CAC — Listing Created",          `=IFERROR(B${r+1}/B${r+6},0)`,    "$60.00","Spend ÷ P3 events"],
  ]
}

// GUEST
function buildGuestCalc(startRow) {
  const r = startRow
  return [
    ["GUEST CALCULATED METRICS","Value","Benchmark","Notes"],
    ["Spend ($)",                        sAud("Guest","Z"),                "","Total guest ad spend"],
    ["Impressions",                      sAud("Guest","AA"),               "",""],
    ["Link Clicks",                      sAud("Guest","AC"),               "",""],
    ["Checkout Initiated",               sAud("Guest","AG"),               "","checkout_initiated event"],
    ["New Bookings (Purchase)",          sAud("Guest","AH"),               "","Purchase conversions"],
    ["","","",""],
    ["CTR  (Clicks ÷ Impressions)",      `=IFERROR(B${r+3}/B${r+2},0)`,   "1.50%",""],
    ["CPC  (Spend ÷ Clicks)",            `=IFERROR(B${r+1}/B${r+3},0)`,   "$1.50",""],
    ["CVR  (Checkout ÷ Clicks)",         `=IFERROR(B${r+4}/B${r+3},0)`,   "8.00%","Checkout initiation rate"],
    ["CVR  (Purchase ÷ Checkout)",       `=IFERROR(B${r+5}/B${r+4},0)`,   "35.00%","Checkout completion rate"],
    ["CVR  (Purchase ÷ Clicks)",         `=IFERROR(B${r+5}/B${r+3},0)`,   "3.00%","Click-to-purchase rate"],
    ["CPA  (Spend ÷ Purchase)",          `=IFERROR(B${r+1}/B${r+5},0)`,   "$80.00","Cost per new booking"],
    ["Revenue  (Bookings × $35)",        `=IFERROR(B${r+5}*35,0)`,        "","Gross Booking Value proxy"],
    ["ROAS  (Revenue ÷ Spend)",          `=IFERROR((B${r+5}*35)/B${r+1},0)`,"1.50×","Return on ad spend"],
  ]
}

// Number format requests for a calc block (base = 0-indexed start row)
function calcFmt(sid, base, isHost=false, isOverall=false) {
  const bg = isOverall ? C.allBg : isHost ? C.hostBg : C.gstBg
  const reqs = [
    // Header row
    cFmt(sid,base,base+1,0,4,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}}),
    rh(sid,base,base+1,28),
    // Raw metric rows (base+1 to base+6)
    cFmt(sid,base+1,base+7,0,4,{backgroundColor:C.calcRow,textFormat:{fontSize:10}}),
    cFmt(sid,base+1,base+2,1,2,USD),   // Spend
    cFmt(sid,base+2,base+7,1,2,INT),   // Imps, Clicks, events
    // Blank spacer (base+7 for host/guest, varies for overall)
    // Calc rows
    cFmt(sid,base+8,base+16,0,4,{backgroundColor:C.calcAlt,textFormat:{fontSize:10}}),
    cFmt(sid,base+8,base+9, 1,2,PCT),  // CTR
    cFmt(sid,base+9,base+10,1,2,USD),  // CPC
    ...(isOverall
      ? [cFmt(sid,base+10,base+11,1,2,USD), // CPM
         cFmt(sid,base+11,base+12,1,2,PCT), // Blended CVR
         cFmt(sid,base+12,base+13,1,2,USD)] // Blended CPA
      : [cFmt(sid,base+10,base+13,1,2,PCT), // CVRs
         cFmt(sid,base+13,base+15,1,2,USD), // CAC/CPA
         ...(isHost
           ? [cFmt(sid,base+15,base+16,1,2,USD)]  // CAC P3
           : [cFmt(sid,base+14,base+15,1,2,USD),   // Revenue
              cFmt(sid,base+15,base+16,1,2,DEC2)])  // ROAS
        ]),
    // Benchmark + notes — grey italic
    cFmt(sid,base,base+16,2,4,GRY),
  ]
  return reqs
}

// ── Creative tab calc block (top-of-tab summary) ──────────────────────────
// Compact 11-row block anchored right after title/subtitle
function buildCreativeCalc(audience, startRow) {
  const r = startRow
  const isHost = audience === "Host"
  const sA = (col)=>sAud(audience,col)
  if(isHost) return [
    [`${audience.toUpperCase()} SUMMARY METRICS`,"Value","Benchmark","Notes"],
    ["Spend ($)",               sA("Z"),                             "",""],
    ["Impressions",             sA("AA"),                            "",""],
    ["Link Clicks",             sA("AC"),                            "",""],
    ["Host Clicks (P1)",        sA("AD"),                            "",""],
    ["CTR",                     `=IFERROR(B${r+3}/B${r+2},0)`,      "1.50%","Clicks ÷ Impressions"],
    ["CPC",                     `=IFERROR(B${r+1}/B${r+3},0)`,      "$1.50","Spend ÷ Clicks"],
    ["CVR P1  (BHC ÷ Clicks)",  `=IFERROR(B${r+4}/B${r+3},0)`,      "8.00%",""],
    ["CAC — Host Click",        `=IFERROR(B${r+1}/B${r+4},0)`,      "$12.00","Spend ÷ P1 events"],
  ]
  return [
    [`${audience.toUpperCase()} SUMMARY METRICS`,"Value","Benchmark","Notes"],
    ["Spend ($)",               sA("Z"),                             "",""],
    ["Impressions",             sA("AA"),                            "",""],
    ["Link Clicks",             sA("AC"),                            "",""],
    ["New Bookings",            sA("AH"),                            "","Purchase"],
    ["CTR",                     `=IFERROR(B${r+3}/B${r+2},0)`,      "1.50%","Clicks ÷ Impressions"],
    ["CPC",                     `=IFERROR(B${r+1}/B${r+3},0)`,      "$1.50","Spend ÷ Clicks"],
    ["CVR  (Purchase ÷ Clicks)",`=IFERROR(B${r+4}/B${r+3},0)`,      "3.00%",""],
    ["CPA  (Spend ÷ Purchase)",  `=IFERROR(B${r+1}/B${r+4},0)`,     "$80.00","Cost per booking"],
  ]
}

function creativeCalcFmt(sid, base, isHost) {
  const bg = isHost ? C.hostBg : C.gstBg
  return [
    cFmt(sid,base,base+1,0,4,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}}),
    rh(sid,base,base+1,28),
    cFmt(sid,base+1,base+5,0,4,{backgroundColor:C.calcRow,textFormat:{fontSize:10}}),
    cFmt(sid,base+1,base+2,1,2,USD),
    cFmt(sid,base+2,base+5,1,2,INT),
    cFmt(sid,base+5,base+9,0,4,{backgroundColor:C.calcAlt,textFormat:{fontSize:10}}),
    cFmt(sid,base+5,base+6,1,2,PCT),  // CTR
    cFmt(sid,base+6,base+7,1,2,USD),  // CPC
    cFmt(sid,base+7,base+8,1,2,PCT),  // CVR
    cFmt(sid,base+8,base+9,1,2,USD),  // CAC/CPA
    cFmt(sid,base,base+9,2,4,GRY),
  ]
}

// ── Section label + title helpers ─────────────────────────────────────────
function secRow(sid,row,label,bg,big=false) {
  return [
    cFmt(sid,row,row+1,0,10,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:big?13:11},verticalAlignment:"MIDDLE",padding:{top:big?10:7,bottom:big?10:7}}),
    rh(sid,row,row+1,big?36:28),
  ]
}

function titleRows(sid,numCols) {
  return [
    cFmt(sid,0,1,0,numCols,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(sid,1,2,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(sid,2,3,0,numCols,{backgroundColor:C.navy}),
    rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
    frz(sid,3,1),
  ]
}

function numFmtPivots(sid) {
  return [cFmt(sid,3,2000,1,2,USD), cFmt(sid,3,2000,2,12,INT)]
}

// ── DEFINITIVE PERFORMANCE REPORT LAYOUT ─────────────────────────────────
// Pivots auto-expand downward — leave enough room between anchor points
// Each pivot gets ~10 rows buffer (typical pivots use 4-6 rows)
//
// R1   Title
// R2   Subtitle
// R3   Spacer
// R4   "▌ OVERALL · By Platform"        → pivot anchor R5
// R14  "▌ OVERALL · By Phase"           → pivot anchor R15
// R24  "▌ OVERALL · By Funnel Stage"    → pivot anchor R25
// R34  "▌ OVERALL · By Audience Group"  → pivot anchor R35
// R44  "▌ OVERALL · Engagement & Cost"  → calc block R45-R57
// R59  "⬛ HOST PERFORMANCE"
// R61  "▌ HOST · Calculated Metrics"    → calc block R62-R77
// R79  "▌ HOST · By Phase"              → pivot anchor R80
// R90  "▌ HOST · By Funnel Stage"       → pivot anchor R91
// R101 "▌ HOST · Prospecting Targeting" → pivot anchor R102 (25 row buffer)
// R128 "▌ HOST · Retargeting Targeting" → pivot anchor R129 (25 row buffer)
// R155 "⬛ GUEST PERFORMANCE"
// R157 "▌ GUEST · Calculated Metrics"   → calc block R158-R173
// R175 "▌ GUEST · By Phase"             → pivot anchor R176
// R186 "▌ GUEST · By Funnel Stage"      → pivot anchor R187
// R197 "▌ GUEST · Prospecting Targeting"→ pivot anchor R198
// R224 "▌ GUEST · Retargeting Targeting"→ pivot anchor R225

async function buildPerformanceReport(PR, SRC) {
  const SECTIONS = [
    {r:3,  label:"▌ OVERALL  ·  By Platform",      bg:C.secBg},
    {r:13, label:"▌ OVERALL  ·  By Phase",           bg:C.secBg},
    {r:23, label:"▌ OVERALL  ·  By Funnel Stage",    bg:C.secBg},
    {r:33, label:"▌ OVERALL  ·  By Audience Group",  bg:C.secBg},
    {r:43, label:"▌ OVERALL  ·  Engagement & Cost Metrics", bg:C.allBg},
    {r:58, label:"⬛  HOST PERFORMANCE",              bg:C.hostBg, big:true},
    {r:60, label:"▌ HOST  ·  Calculated Metrics (KPI, CVR, CAC)", bg:C.hostBg},
    {r:78, label:"▌ HOST  ·  By Phase",              bg:C.hostBg},
    {r:89, label:"▌ HOST  ·  By Funnel Stage",       bg:C.hostBg},
    {r:100,label:"▌ HOST  ·  Prospecting — Targeting Tactic × Targeting Name", bg:C.hostBg},
    {r:127,label:"▌ HOST  ·  Retargeting — Targeting Tactic × Targeting Name", bg:C.hostBg},
    {r:154,label:"⬛  GUEST PERFORMANCE",             bg:C.gstBg, big:true},
    {r:156,label:"▌ GUEST  ·  Calculated Metrics (KPI, CVR, CPA, ROAS)",bg:C.gstBg},
    {r:174,label:"▌ GUEST  ·  By Phase",             bg:C.gstBg},
    {r:185,label:"▌ GUEST  ·  By Funnel Stage",      bg:C.gstBg},
    {r:196,label:"▌ GUEST  ·  Prospecting — Targeting Tactic × Targeting Name",bg:C.gstBg},
    {r:223,label:"▌ GUEST  ·  Retargeting — Targeting Tactic × Targeting Name",bg:C.gstBg},
  ]

  // Build sparse label rows
  const totalRows = 260
  const arr = Array.from({length:totalRows},()=>[""])
  arr[0]=["thrml — Performance Report"]
  arr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  arr[2]=[""]
  for(const s of SECTIONS) arr[s.r]=[s.label]

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"'Performance Report'!A1:Z260"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:"'Performance Report'!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:arr.slice(0,254)}
  })

  // Write calc blocks
  const calcBlocks = [
    {row:44,  fn:buildOverallCalc, arg:44},
    {row:61,  fn:buildHostCalc,    arg:61},
    {row:157, fn:buildGuestCalc,   arg:157},
  ]
  for(const {row,fn,arg} of calcBlocks) {
    await sheets.spreadsheets.values.update({
      spreadsheetId:MASTER,range:`'Performance Report'!A${row}:D${row+15}`,
      valueInputOption:"USER_ENTERED",requestBody:{values:fn(arg)}
    })
  }

  // Pivots
  const pivotReqs = [
    piv(PR,SRC,4, [COL.platform],ALL_MET),
    piv(PR,SRC,14,[COL.phase],   ALL_MET),
    piv(PR,SRC,24,[COL.funnel],  ALL_MET),
    piv(PR,SRC,34,[COL.audGroup],ALL_MET),
    // Host
    piv(PR,SRC,79, [COL.phase],  HST_MET,[hostF]),
    piv(PR,SRC,90, [COL.funnel], HST_MET,[hostF]),
    piv(PR,SRC,101,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,prospF]),
    piv(PR,SRC,128,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,rtF]),
    // Guest
    piv(PR,SRC,175,[COL.phase],  GST_MET,[guestF]),
    piv(PR,SRC,186,[COL.funnel], GST_MET,[guestF]),
    piv(PR,SRC,197,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,prospF]),
    piv(PR,SRC,224,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,rtF]),
  ]

  // Formatting
  const secFmts = SECTIONS.flatMap(s=>[
    cFmt(PR,s.r,s.r+1,0,10,{backgroundColor:s.bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:s.big?13:11},verticalAlignment:"MIDDLE",padding:{top:s.big?10:7,bottom:s.big?10:7}}),
    rh(PR,s.r,s.r+1,s.big?36:28),
  ])

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...pivotReqs,
    ...titleRows(PR,10),
    ...secFmts,
    ...numFmtPivots(PR),
    ...calcFmt(PR,43,false,true),  // overall calc (0-indexed = row 44 - 1)
    ...calcFmt(PR,60,true,false),  // host calc
    ...calcFmt(PR,156,false,false), // guest calc
    cw(PR,0,1,255),cw(PR,1,2,110),cw(PR,2,3,120),cw(PR,3,4,110),
    cw(PR,4,5,140),cw(PR,5,6,155),cw(PR,6,7,130),cw(PR,7,8,90),cw(PR,8,9,135),
  ]}})
  console.log("   ✅ Performance Report: clean layout, 12 pivots, 3 calc blocks")
}

// ── CREATIVE TABS ─────────────────────────────────────────────────────────
async function buildCreativeTab(tabTitle, sid, SRC, audience, filter, met) {
  const isHost = audience === "Host"
  const bg     = isHost ? C.hostBg : C.gstBg

  // Layout:
  // R1   Title
  // R2   Subtitle
  // R3   Spacer
  // R4   Summary Calc Block header → R4-R12 (9 rows)
  // R13  Spacer
  // R14  "▌ BY ANGLE"    → pivot R15
  // R25  "▌ BY FORMAT TYPE" → pivot R26
  // R36  "▌ BY LENGTH"   → pivot R37
  // R47  "▌ BY ASPECT RATIO" → pivot R48
  // R58  "▌ BY CTA"      → pivot R59
  // R70  "▌ BY TARGETING NAME" → pivot R71

  const pivotsLayout = [
    {row:13,label:"▌ BY ANGLE",       col:COL.angle},
    {row:24,label:"▌ BY FORMAT TYPE", col:COL.fmtType},
    {row:35,label:"▌ BY LENGTH",      col:COL.length},
    {row:46,label:"▌ BY ASPECT RATIO",col:COL.ratio},
    {row:57,label:"▌ BY CTA",         col:COL.cta},
    {row:68,label:"▌ BY TARGETING NAME",col:COL.tgtName},
  ]

  const arr = Array.from({length:100},()=>[""])
  arr[0]=[`thrml — ${tabTitle}`]
  arr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  arr[2]=[""]
  for(const s of pivotsLayout) arr[s.row]=[s.label]

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:`'${tabTitle}'!A1:Z200`})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:`'${tabTitle}'!A1`,
    valueInputOption:"USER_ENTERED",requestBody:{values:arr.slice(0,90)}
  })

  // Write summary calc block at row 4
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:`'${tabTitle}'!A4:D12`,
    valueInputOption:"USER_ENTERED",
    requestBody:{values:buildCreativeCalc(audience,4)}
  })

  const pivotReqs = pivotsLayout.map(s=>piv(sid,SRC,s.row+1,[s.col],met,[filter]))

  const secFmts = pivotsLayout.flatMap(s=>[
    cFmt(sid,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}}),
    rh(sid,s.row,s.row+1,28),
  ])

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...pivotReqs,
    ...titleRows(sid,9),
    ...secFmts,
    ...numFmtPivots(sid),
    ...creativeCalcFmt(sid,3,isHost),   // 0-indexed = row 4-1 = 3
    cw(sid,0,1,190),cw(sid,1,2,110),cw(sid,2,3,120),cw(sid,3,4,110),
    cw(sid,4,5,140),cw(sid,5,6,155),cw(sid,6,7,130),cw(sid,7,8,90),cw(sid,8,9,135),
  ]}})
  console.log(`   ✅ ${tabTitle}: summary calc + 6 pivots`)
}

// ── DRIVE: 30-day consolidated files ─────────────────────────────────────
async function getDatedFolder(rootId, date) {
  const year  = String(date.getFullYear())
  const month = date.toLocaleDateString("en-US",{month:"long"})
  const gc = async(pid,name)=>{
    const r=await drive.files.list({q:`'${pid}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:"files(id)"})
    if(r.data.files?.length>0) return r.data.files[0].id
    const c=await drive.files.create({requestBody:{name,mimeType:"application/vnd.google-apps.folder",parents:[pid]},fields:"id"})
    console.log(`  📁 Created: ${name}/`); return c.data.id
  }
  return { monthId: await gc(await gc(rootId,year),month), year, month }
}

async function writeConsolidatedFile(folderId, fileName, rows) {
  const res = await drive.files.list({q:`'${folderId}' in parents and name='${fileName}' and trashed=false`,fields:"files(id)"})
  let fid = res.data.files?.[0]?.id
  if(!fid) {
    try {
      const c=await drive.files.create({requestBody:{name:fileName,mimeType:"application/vnd.google-apps.spreadsheet",parents:[folderId]},fields:"id"})
      fid=c.data.id; console.log(`  ✅ Created: ${fileName}`)
    } catch { console.log(`  ⚠️  Cannot create '${fileName}' — share folder with service account`); return null }
  } else { console.log(`  ✅ Updated: ${fileName} (${rows.length} rows)`) }
  await sheets.spreadsheets.values.clear({spreadsheetId:fid,range:"Sheet1!A1:AI2000"})
  await sheets.spreadsheets.values.update({spreadsheetId:fid,range:"Sheet1!A1",valueInputOption:"USER_ENTERED",requestBody:{values:[HEADERS,...rows]}})
  return fid
}

async function formatDriveFile(fid, isRaw) {
  const m   = await sheets.spreadsheets.get({spreadsheetId:fid})
  const sid = m.data.sheets?.[0]?.properties?.sheetId ?? 0
  const hdr = isRaw ? C.rawHdr : C.ink
  const cc  = (r1,r2,c1,c2,f)=>cFmt(sid,r1,r2,c1,c2,f)
  const cw2 = (a,b,px)=>cw(sid,a,b,px)
  await sheets.spreadsheets.batchUpdate({spreadsheetId:fid,requestBody:{requests:[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    cc(0,1,0,N,{backgroundColor:hdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    cc(0,1,1,4,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}}),
    cc(0,1,16,17,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}}),
    cc(1,2000,1,4,{backgroundColor:C.fmlHL}),
    cc(1,2000,16,17,{backgroundColor:C.fmlHL}),
    ...(isRaw?[cc(1,2000,0,N,{backgroundColor:{red:0.965,green:0.973,blue:0.992}})]:[]),
    cc(1,2000,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,2000,COL.spend,COL.spend+1,USD),
    cc(1,2000,COL.imps,N,INT),
    cw2(0,1,100),cw2(1,2,50),cw2(2,3,50),cw2(3,4,185),cw2(4,5,70),cw2(5,6,50),
    cw2(6,7,75),cw2(7,8,240),cw2(8,9,75),cw2(9,10,255),cw2(10,11,65),cw2(11,12,160),
    cw2(12,13,115),cw2(13,14,105),cw2(14,15,115),cw2(15,16,155),cw2(16,17,170),cw2(17,18,75),
    cw2(18,19,110),cw2(19,20,80),cw2(20,21,65),cw2(21,22,85),cw2(22,23,90),cw2(23,24,195),cw2(24,25,170),
    cw2(25,35,85),
  ]}})
}

// ── Data generation (reuse from rebuild-v4) ───────────────────────────────
const ALLCAPS=new Set(["UGC","LAL","RSA","CRM","CTR","CPM","CPC","CPA","ROAS","CAC","ROI","PMAX","REELS","US","NA","META","GOOG"])
const na=v=>(!v||v==="-"||v===""?"NA":v)
const tc=s=>{
  if(!s||s==="NA")return"NA"
  if(/^[CP]\d{3}$/.test(s)||/^(AS|AD)\d{3}$/.test(s)||/^P\d$/.test(s))return s
  return s.replace(/_/g," ").replace(/\w+/g,w=>ALLCAPS.has(w.toUpperCase())?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase())
}
const fmt=(n,d=2)=>Number(n).toFixed(d)
const jit=(base,pct=0.18)=>base*(1+(Math.random()-0.5)*pct)
const weekF=row=>`=CONCATENATE("Week ",ISOWEEKNUM(A${row})," (",TEXT(A${row}-WEEKDAY(A${row},2)+1,"MM/DD")," - ",TEXT(A${row}-WEEKDAY(A${row},2)+7,"MM/DD/YY"),")")`
const PLAT={META:"Meta",GOOG:"Google"},OBJ={REACH:"Reach",LEAD:"Lead",CONV:"Conversion"},
      FUN={PROSP:"Prospecting",LAL:"Lookalike",LAL1:"Lookalike",LAL2:"Lookalike",RT:"Retargeting"},
      GEO={SEA:"Seattle",ALL:"All",US:"US"},
      TAC={int:"Interest",lal1:"LAL 1%",lal2:"LAL 2%",lal:"LAL",rt_checkout:"Retargeting - Checkout",rt_listing:"Retargeting - Listing"}

async function loadNamer(){
  const [cb,ab,cr]=await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Campaign Builder!A2:L20"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Ad Set Builder!A2:J30"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Creative Builder!A2:Q25"}),
  ])
  const camps=(cb.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],platform:r[1],phase:r[2],funnel:r[3],objective:r[4],audType:r[6],geo:r[7],name:r[8],event:r[9]}))
  const adsets=(ab.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],campId:r[1],spaceType:r[3],audSrc:r[4],placement:r[5],name:r[7]}))
  const creatives=(cr.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],asId:r[1],campId:r[2],concept:r[3],format:r[4],length:r[5],size:r[6],cta:r[8],adName:r[10],hook:r[11]}))
  return {camps,adsets,creatives}
}
async function loadLookup(){
  const def={gen:"General Interest",sauna:"Sauna Interest",hottub:"Hot Tub Interest",coldplunge:"Cold Plunge Interest",income:"Income / Earn Interest",wellness:"Wellness Interest",biohacking:"Biohacking Interest",checkout_rt:"Checkout Retargeting",listing_rt:"Listing View Retargeting",all_spaces:"All Spaces"}
  try{const r=await sheets.spreadsheets.values.get({spreadsheetId:MASTER,range:"Targeting Lookup!A2:B100"});return(r.data.values??[]).reduce((a,row)=>{if(row[0]&&row[1])a[row[0].toLowerCase().trim()]=row[1].trim();return a},{...def})}catch{return def}
}

// ── Date helpers for Drive hardcoded values ────────────────────────────────
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
function dateToYear(iso)  { return String(new Date(iso+"T12:00:00Z").getUTCFullYear()) }
function dateToMonth(iso) { return MONTHS_SHORT[new Date(iso+"T12:00:00Z").getUTCMonth()] }
function dateToWeek(iso)  {
  const d = new Date(iso+"T12:00:00Z")
  const tmp = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  const dow = tmp.getUTCDay()||7; tmp.setUTCDate(tmp.getUTCDate()+4-dow)
  const yr  = new Date(Date.UTC(tmp.getUTCFullYear(),0,1))
  const wk  = Math.ceil((((tmp-yr)/86400000)+1)/7)
  const mon = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  mon.setUTCDate(mon.getUTCDate()-((mon.getUTCDay()||7)-1))
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate()+6)
  const p   = n=>String(n).padStart(2,"0")
  const yy  = String(d.getUTCFullYear()).slice(2)
  return `Week ${wk} (${p(mon.getUTCMonth()+1)}/${p(mon.getUTCDate())} - ${p(sun.getUTCMonth()+1)}/${p(sun.getUTCDate())}/${yy})`
}

// driveMode=true → hardcoded values (no row-ref formulas) for Drive file exports
// driveMode=false → live Sheets formulas for Master Report Platform Data
function genDay(namer,lookup,dateStr,sheetRowStart,driveMode=false){
  const campMap=Object.fromEntries(namer.camps.map(c=>[c.id,c]))
  const adsetMap=Object.fromEntries(namer.adsets.map(a=>[a.id,a]))
  const rows=[]
  // Pre-compute hardcoded date values once per day (used in driveMode)
  const yearVal  = dateToYear(dateStr)
  const monthVal = dateToMonth(dateStr)
  const weekVal  = dateToWeek(dateStr)
  for(const cr of namer.creatives){
    const camp=campMap[cr.campId];if(!camp)continue
    const adset=adsetMap[cr.asId];if(!adset)continue
    const R=sheetRowStart+rows.length   // only used for formula mode
    const ph=parseInt(camp.phase?.replace("P","")||"1")
    const isVideo=["video","ugc"].includes(cr.format?.toLowerCase())
    const isGoog=camp.platform?.toUpperCase()==="GOOG"
    const isGuest=(camp.audType??"").toLowerCase()==="guest"
    const spend=jit(isGoog?24:(ph===1?13:ph===2?29:23))
    const imps=Math.round(jit(isGoog?3800:(ph===1?9500:ph===2?7200:3400)))
    const reach=Math.round(imps*0.91)
    const clicks=Math.round(jit(isGoog?260:imps*0.022))
    const bhc=camp.event==="become_host_click"?Math.max(0,Math.round(jit(16,0.45))):0
    const hos=camp.event==="host_onboarding_started"?Math.max(0,Math.round(jit(11,0.5))):0
    const lc=camp.event==="listing_created"?Math.max(0,Math.round(jit(3,0.6))):0
    const ci=isGuest?Math.max(0,Math.round(jit(clicks*0.08,0.4))):0
    const pur=camp.event==="Purchase"?Math.max(0,Math.round(jit(ci*0.35,0.6))):0
    const vv100=isVideo?Math.round(jit(imps*0.07,0.3)):0
    const platform=PLAT[camp.platform?.toUpperCase()]??camp.platform
    const objective=tc(OBJ[camp.objective?.toUpperCase()]??camp.objective)
    const funnel=tc(FUN[camp.funnel?.toUpperCase()]??camp.funnel)
    const audGroup=tc(camp.audType)
    const geo=GEO[camp.geo?.toUpperCase()]??tc(camp.geo)
    const tactic=TAC[adset.audSrc?.toLowerCase()]??tc(adset.audSrc)
    const tgtKey=adset.spaceType?.toLowerCase()??""
    const tgtName=lookup[tgtKey]??tc(adset.spaceType)
    // Year / Month / Week: formulas for Master Report, plain values for Drive
    const colYear  = driveMode ? yearVal  : `=YEAR(A${R})`
    const colMonth = driveMode ? monthVal : `=TEXT(A${R},"Mmm")`
    const colWeek  = driveMode ? weekVal  : weekF(R)
    // Targeting Name: VLOOKUP formula for Master Report, resolved value for Drive
    const colTgt   = driveMode ? tgtName
      : `=IFERROR(VLOOKUP(INDEX(SPLIT(J${R},"_"),1,9),'Targeting Lookup'!$A:$B,2,FALSE),"${tgtName}")`
    rows.push([
      dateStr,colYear,colMonth,colWeek,
      platform,na(camp.phase),camp.id,camp.name,adset.id,adset.name,cr.id,cr.adName??cr.id,
      objective,audGroup,funnel,tactic,colTgt,
      geo,tc(cr.concept),tc(cr.format),na(cr.length),na(cr.size),
      tc(cr.cta?.replace(/_/g," ")),na(cr.hook),na(camp.event),
      fmt(spend),String(imps),String(reach),String(clicks),
      String(bhc),String(hos),String(lc),String(ci),String(pur),String(vv100),
    ])
  }
  return rows
}

async function main() {
  console.log("\n🔄  Rebuild v5 — clean layout, calc metrics everywhere, 30-day Drive files\n")

  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  const SRC = tabMap["Platform Data"]
  console.log("Tabs:", Object.keys(tabMap).join(", "))

  // ── 1. Load Namer ─────────────────────────────────────────────────────────
  console.log("\n📖 Loading Namer...")
  const [namer,lookup] = await Promise.all([loadNamer(),loadLookup()])
  console.log(`   ${namer.camps.length} camps | ${namer.adsets.length} ad sets | ${namer.creatives.length} ads`)

  // ── 2. Generate last 30 days ───────────────────────────────────────────────
  console.log("\n📅 Generating 30 days of data...")
  const today = new Date("2026-04-23T12:00:00Z")
  const dates = []
  for(let i=29; i>=0; i--) {
    const d = new Date(today); d.setDate(today.getDate()-i)
    dates.push(d.toISOString().slice(0,10))
  }
  console.log(`   Range: ${dates[0]} → ${dates[dates.length-1]}`)

  const allRows = []
  for(const dateStr of dates) {
    allRows.push(...genDay(namer,lookup,dateStr,2+allRows.length))
  }
  console.log(`   ${allRows.length} rows (${namer.creatives.length} ads × 30 days)`)

  // ── 3. Write Platform Data ────────────────────────────────────────────────
  console.log("\n📊 Writing Platform Data...")
  for(const [label,sid] of [["Master Report",MASTER],["Finance Tracker",FINANCE]]) {
    await sheets.spreadsheets.values.clear({spreadsheetId:sid,range:"Platform Data!A1:AI2000"})
    await sheets.spreadsheets.values.update({
      spreadsheetId:sid,range:"Platform Data!A1",valueInputOption:"USER_ENTERED",
      requestBody:{values:[HEADERS,...allRows]}
    })
    console.log(`   ✅ ${label}: ${allRows.length} rows, ${N} cols`)
  }
  // Reformat Platform Data
  const pdFmt=[
    frz(SRC,1,0),
    cFmt(SRC,0,1,0,N,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    ...[1,2,3,16].map(c=>cFmt(SRC,0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}})),
    ...[1,2,3,16].map(c=>cFmt(SRC,1,2000,c,c+1,{backgroundColor:C.fmlHL})),
    cFmt(SRC,1,2000,0,1,DATE_F),
    cFmt(SRC,1,2000,COL.spend,COL.spend+1,USD),
    cFmt(SRC,1,2000,COL.imps,N,INT),
    cFmt(SRC,1,2000,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cw(SRC,0,1,100),cw(SRC,1,2,50),cw(SRC,2,3,50),cw(SRC,3,4,185),cw(SRC,4,5,70),cw(SRC,5,6,50),
    cw(SRC,6,7,75),cw(SRC,7,8,240),cw(SRC,8,9,75),cw(SRC,9,10,255),cw(SRC,10,11,65),cw(SRC,11,12,160),
    cw(SRC,12,13,115),cw(SRC,13,14,105),cw(SRC,14,15,115),cw(SRC,15,16,155),cw(SRC,16,17,170),cw(SRC,17,18,75),
    cw(SRC,18,19,110),cw(SRC,19,20,80),cw(SRC,20,21,65),cw(SRC,21,22,85),cw(SRC,22,23,90),cw(SRC,23,24,195),cw(SRC,24,25,170),
    cw(SRC,25,35,85),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:pdFmt}})
  console.log("   ✅ Platform Data formatted")

  // ── 4. Performance Report ─────────────────────────────────────────────────
  console.log("\n📊 Rebuilding Performance Report...")
  await buildPerformanceReport(tabMap["Performance Report"], SRC)

  // ── 5. Creative tabs ──────────────────────────────────────────────────────
  console.log("\n📊 Rebuilding creative tabs...")
  await buildCreativeTab("Host Creative",  tabMap["Host Creative"],  SRC,"Host", hostF,  HST_MET)
  await buildCreativeTab("Guest Creative", tabMap["Guest Creative"], SRC,"Guest",guestF, GST_MET)

  // ── 6. Spend Breakdown ────────────────────────────────────────────────────
  console.log("\n📊 Rebuilding Spend Breakdown...")
  const SB = tabMap["Spend Breakdown"]
  const sbSecs=[
    {row:3,col:COL.platform,label:"▌ BY PLATFORM"},
    {row:13,col:COL.phase,   label:"▌ BY PHASE"},
    {row:23,col:COL.month,   label:"▌ BY MONTH"},
    {row:33,col:COL.week,    label:"▌ BY WEEK"},
    {row:43,col:COL.geo,     label:"▌ BY GEO"},
    {row:52,col:COL.date,    label:"▌ BY DATE"},
  ]
  const sbArr=Array.from({length:100},()=>[""])
  sbArr[0]=["thrml — Spend Breakdown"]
  sbArr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  sbArr[2]=[""]
  for(const s of sbSecs) sbArr[s.row]=[s.label]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Spend Breakdown!A1",valueInputOption:"USER_ENTERED",requestBody:{values:sbArr.slice(0,90)}})
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...sbSecs.map(s=>piv(SB,SRC,s.row+1,[s.col],SPD_MET)),
    ...titleRows(SB,4),
    ...sbSecs.flatMap(s=>[
      cFmt(SB,s.row,s.row+1,0,4,{backgroundColor:C.secBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}}),
      rh(SB,s.row,s.row+1,28),
    ]),
    ...numFmtPivots(SB),
    cw(SB,0,1,210),cw(SB,1,2,115),cw(SB,2,3,120),cw(SB,3,4,110),
  ]}})
  console.log("   ✅ Spend Breakdown: 6 pivots")

  // ── 7. 30-day consolidated Drive files (driveMode=true → plain values) ───
  console.log("\n📁 Writing 30-day consolidated Drive files...")
  const driveRows = []
  for(const dateStr of dates) {
    // Drive rows use plain hardcoded values (no row-ref formulas)
    driveRows.push(...genDay(namer,lookup,dateStr,2+driveRows.length,true))
  }
  const metaRows30 = driveRows.filter(r=>r[4]==="Meta")
  const allRows30  = allRows   // all platforms
  const todayDate  = today
  const mm=String(todayDate.getUTCMonth()+1).padStart(2,"0")
  const dd=String(todayDate.getUTCDate()).padStart(2,"0")
  const yy=String(todayDate.getUTCFullYear()).slice(2)
  const dateTag = `${mm}.${dd}.${yy}`
  const {monthId:rawMo}     = await getDatedFolder(RAW_ROOT,     todayDate)
  const {monthId:cleanedMo} = await getDatedFolder(CLEANED_ROOT, todayDate)

  const rawFid     = await writeConsolidatedFile(rawMo,     `Meta_Daily Report_Raw_Last30Days_${dateTag}`,     metaRows30)
  const cleanedFid = await writeConsolidatedFile(cleanedMo, `Meta_Daily Report_Cleaned_Last30Days_${dateTag}`, metaRows30)
  if(rawFid)     { await formatDriveFile(rawFid,     true);  console.log(`   ✅ Raw:     ${metaRows30.length} rows (Meta, 30 days)`) }
  if(cleanedFid) { await formatDriveFile(cleanedFid, false); console.log(`   ✅ Cleaned: ${metaRows30.length} rows (Meta, 30 days)`) }

  // Final tab order
  const finalOrder=["Performance Report","Host Creative","Guest Creative","Spend Breakdown","Targeting Lookup","Reference Table","Platform Data"]
  const freshMap=Object.fromEntries((await sheets.spreadsheets.get({spreadsheetId:MASTER})).data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:
    finalOrder.filter(t=>freshMap[t]).map((t,i)=>({updateSheetProperties:{properties:{sheetId:freshMap[t],index:i},fields:"index"}}))
  }})

  console.log(`\n✅ All done\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e=>{console.error("❌",e.message);process.exit(1)})
