/**
 * thrml — Full Rebuild v4
 * - Fix schema: add checkout_initiated + Video Views 100% (no duplicates)
 * - Generate 4/15 – 4/22 mock data (8 days)
 * - Write Raw + Cleaned per-day files into dated Drive folders
 * - Rebuild Platform Data in Master Report + Finance Tracker
 * - Rebuild Performance Report: pivots + calculated metric tables (CPC, CTR, CVR, CPA, ROAS)
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

// ── DEFINITIVE 35-column schema ───────────────────────────────────────────
const HEADERS = [
  "Date",                     // A  0
  "Year",                     // B  1  formula
  "Month",                    // C  2  formula
  "Week",                     // D  3  formula
  "Platform",                 // E  4
  "Phase",                    // F  5
  "Campaign ID",              // G  6
  "Campaign Name",            // H  7
  "Ad Set ID",                // I  8
  "Ad Set Name",              // J  9
  "Ad ID",                    // K  10
  "Ad Name",                  // L  11
  "Campaign Objective",       // M  12
  "Audience Group",           // N  13
  "Funnel Stage",             // O  14
  "Targeting Tactic",         // P  15
  "Targeting Name",           // Q  16  formula
  "Geo",                      // R  17
  "Angle",                    // S  18
  "Format Type",              // T  19
  "Length",                   // U  20
  "Aspect Ratio",             // V  21
  "CTA",                      // W  22
  "Hook Copy",                // X  23
  "Opt. Event",               // Y  24
  "Spend ($)",                // Z  25
  "Impressions",              // AA 26
  "Reach",                    // AB 27
  "Link Clicks",              // AC 28
  "become_host_click",        // AD 29  host P1
  "host_onboarding_started",  // AE 30  host P2
  "listing_created",          // AF 31  host P3
  "checkout_initiated",       // AG 32  guest funnel
  "Purchase",                 // AH 33  guest conversion
  "Video Views 100%",         // AI 34
]

const COL = {
  date:0,year:1,month:2,week:3,platform:4,
  phase:5,campId:6,campName:7,asId:8,asName:9,adId:10,adName:11,
  campObj:12,audGroup:13,funnel:14,tgtTactic:15,tgtName:16,geo:17,
  angle:18,fmtType:19,length:20,ratio:21,cta:22,hook:23,optEvent:24,
  spend:25,imps:26,reach:27,clicks:28,
  bhc:29,hos:30,lc:31,ci:32,pur:33,vv100:34,
}
const FORMULA_COLS = [1,2,3,16]  // Year, Month, Week, Targeting Name

const N = HEADERS.length  // 35

// ── Value helpers ─────────────────────────────────────────────────────────
const ALLCAPS = new Set(["UGC","LAL","RSA","CRM","CTR","CPM","CPC","CPA","ROAS","CAC","ROI","PMAX","REELS","US","NA","META","GOOG"])
const na  = v => (!v||v==="-"||v===""?"NA":v)
const tc  = s => {
  if(!s||s==="NA") return "NA"
  if(/^[CP]\d{3}$/.test(s)||/^(AS|AD)\d{3}$/.test(s)||/^P\d$/.test(s)) return s
  return s.replace(/_/g," ").replace(/\w+/g,w=>ALLCAPS.has(w.toUpperCase())?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase())
}
const fmt = (n,d=2) => Number(n).toFixed(d)
const jit = (base,pct=0.18) => base*(1+(Math.random()-0.5)*pct)
const PLATFORM_D  = {META:"Meta",GOOG:"Google"}
const OBJECTIVE_D = {REACH:"Reach",LEAD:"Lead",CONV:"Conversion",AWARE:"Awareness"}
const FUNNEL_D    = {PROSP:"Prospecting",LAL:"Lookalike",LAL1:"Lookalike",LAL2:"Lookalike",RT:"Retargeting"}
const GEO_D       = {SEA:"Seattle",ALL:"All",US:"US"}
const TACTIC_MAP  = {int:"Interest",lal1:"LAL 1%",lal2:"LAL 2%",lal:"LAL",
  rt_checkout:"Retargeting - Checkout",rt_listing:"Retargeting - Listing",crmatch:"CRM Match"}

// ── Date helpers ──────────────────────────────────────────────────────────
function weekFormula(row) {
  return `=CONCATENATE("Week ",ISOWEEKNUM(A${row})," (",TEXT(A${row}-WEEKDAY(A${row},2)+1,"MM/DD")," - ",TEXT(A${row}-WEEKDAY(A${row},2)+7,"MM/DD/YY"),")")`
}

// ── Load Namer ─────────────────────────────────────────────────────────────
async function loadNamer() {
  const [cb,ab,cr] = await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Campaign Builder!A2:L20"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Ad Set Builder!A2:J30"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Creative Builder!A2:Q25"}),
  ])
  const camps = (cb.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0],platform:r[1],phase:r[2],funnel:r[3],objective:r[4],audType:r[6],geo:r[7],name:r[8],event:r[9]
  }))
  const adsets = (ab.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0],campId:r[1],spaceType:r[3],audSrc:r[4],placement:r[5],name:r[7]
  }))
  const creatives = (cr.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0],asId:r[1],campId:r[2],concept:r[3],format:r[4],length:r[5],size:r[6],cta:r[8],adName:r[10],hook:r[11]
  }))
  return {camps,adsets,creatives}
}

async function loadLookup() {
  const def = {gen:"General Interest",sauna:"Sauna Interest",hottub:"Hot Tub Interest",
    coldplunge:"Cold Plunge Interest",income:"Income / Earn Interest",wellness:"Wellness Interest",
    biohacking:"Biohacking Interest",checkout_rt:"Checkout Retargeting",
    listing_rt:"Listing View Retargeting",all_spaces:"All Spaces"}
  try {
    const r = await sheets.spreadsheets.values.get({spreadsheetId:MASTER,range:"Targeting Lookup!A2:B100"})
    return (r.data.values??[]).reduce((a,row)=>{ if(row[0]&&row[1]) a[row[0].toLowerCase().trim()]=row[1].trim(); return a },{...def})
  } catch { return def }
}

// ── Generate one day's rows ───────────────────────────────────────────────
function genDay(namer, lookup, dateStr, sheetRowStart) {
  const campMap  = Object.fromEntries(namer.camps.map(c=>[c.id,c]))
  const adsetMap = Object.fromEntries(namer.adsets.map(a=>[a.id,a]))
  const rows = []

  for (const cr of namer.creatives) {
    const camp  = campMap[cr.campId]; if(!camp) continue
    const adset = adsetMap[cr.asId];  if(!adset) continue
    const R = sheetRowStart + rows.length

    const ph      = parseInt(camp.phase?.replace("P","")||"1")
    const isVideo = ["video","ugc"].includes(cr.format?.toLowerCase())
    const isGoog  = camp.platform?.toUpperCase()==="GOOG"
    const isGuest = (camp.audType??"").toLowerCase()==="guest"

    const spend  = jit(isGoog?24:(ph===1?13:ph===2?29:23))
    const imps   = Math.round(jit(isGoog?3800:(ph===1?9500:ph===2?7200:3400)))
    const reach  = Math.round(imps*0.91)
    const clicks = Math.round(jit(isGoog?260:imps*0.022))
    const bhc    = camp.event==="become_host_click"       ? Math.max(0,Math.round(jit(16,0.45))) : 0
    const hos    = camp.event==="host_onboarding_started" ? Math.max(0,Math.round(jit(11,0.5)))  : 0
    const lc     = camp.event==="listing_created"         ? Math.max(0,Math.round(jit(3,0.6)))   : 0
    // checkout_initiated: guest funnel step between clicks and purchase (~8% of clicks)
    const ci     = isGuest ? Math.max(0,Math.round(jit(clicks*0.08,0.4))) : 0
    const pur    = camp.event==="Purchase"                ? Math.max(0,Math.round(jit(ci*0.35,0.6))) : 0
    const vv100  = isVideo ? Math.round(jit(imps*0.07,0.3)) : 0

    const platform = PLATFORM_D[camp.platform?.toUpperCase()] ?? camp.platform
    const objective= tc(OBJECTIVE_D[camp.objective?.toUpperCase()] ?? camp.objective)
    const funnel   = tc(FUNNEL_D[camp.funnel?.toUpperCase()] ?? camp.funnel)
    const audGroup = tc(camp.audType)
    const geo      = GEO_D[camp.geo?.toUpperCase()] ?? tc(camp.geo)
    const tactic   = TACTIC_MAP[adset.audSrc?.toLowerCase()] ?? tc(adset.audSrc)
    const tgtKey   = adset.spaceType?.toLowerCase() ?? ""
    const tgtName  = lookup[tgtKey] ?? tc(adset.spaceType)

    rows.push([
      dateStr,                                            // A  Date
      `=YEAR(A${R})`,                                     // B  Year
      `=TEXT(A${R},"Mmm")`,                              // C  Month
      weekFormula(R),                                     // D  Week
      platform,                                           // E
      na(camp.phase),                                     // F
      camp.id,                                            // G
      camp.name,                                          // H
      adset.id,                                           // I
      adset.name,                                         // J
      cr.id,                                              // K
      cr.adName ?? cr.id,                                 // L
      objective,                                          // M
      audGroup,                                           // N
      funnel,                                             // O
      tactic,                                             // P
      `=IFERROR(VLOOKUP(INDEX(SPLIT(J${R},"_"),1,9),'Targeting Lookup'!$A:$B,2,FALSE),"${tgtName}")`, // Q
      geo,                                                // R
      tc(cr.concept),                                     // S
      tc(cr.format),                                      // T
      na(cr.length),                                      // U
      na(cr.size),                                        // V
      tc(cr.cta?.replace(/_/g," ")),                      // W
      na(cr.hook),                                        // X
      na(camp.event),                                     // Y
      fmt(spend),                                         // Z
      String(imps),                                       // AA
      String(reach),                                      // AB
      String(clicks),                                     // AC
      String(bhc),                                        // AD
      String(hos),                                        // AE
      String(lc),                                         // AF
      String(ci),                                         // AG  checkout_initiated
      String(pur),                                        // AH  Purchase
      String(vv100),                                      // AI  Video Views 100%
    ])
  }
  return rows
}

// ── Drive folder helpers ──────────────────────────────────────────────────
async function getDatedFolder(rootId, date) {
  const year  = String(date.getFullYear())
  const month = date.toLocaleDateString("en-US",{month:"long"})
  const gc = async(parentId,name) => {
    const r = await drive.files.list({q:`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:"files(id)"})
    if(r.data.files?.length>0) return r.data.files[0].id
    const c = await drive.files.create({requestBody:{name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]},fields:"id"})
    console.log(`  📁 Created: ${name}/`)
    return c.data.id
  }
  return { monthId: await gc(await gc(rootId,year),month), year, month }
}

async function writeSheet(folderId, fileName, headers, rows) {
  const res = await drive.files.list({q:`'${folderId}' in parents and name='${fileName}' and trashed=false`,fields:"files(id)"})
  let fid = res.data.files?.[0]?.id
  if(!fid) {
    try {
      const c = await drive.files.create({requestBody:{name:fileName,mimeType:"application/vnd.google-apps.spreadsheet",parents:[folderId]},fields:"id"})
      fid = c.data.id; console.log(`  ✅ Created: ${fileName}`)
    } catch(e) { console.log(`  ⚠️  Cannot create '${fileName}' — share folder with service account`); return null }
  } else { console.log(`  ✅ Updated: ${fileName}`) }
  await sheets.spreadsheets.values.clear({spreadsheetId:fid,range:"Sheet1!A1:AI2000"})
  await sheets.spreadsheets.values.update({spreadsheetId:fid,range:"Sheet1!A1",valueInputOption:"USER_ENTERED",requestBody:{values:[headers,...rows]}})
  return fid
}

// ── Format helpers ────────────────────────────────────────────────────────
const C = {
  ink:    {red:0.047,green:0.086,blue:0.157},
  navy:   {red:0.078,green:0.133,blue:0.216},
  secBg:  {red:0.133,green:0.196,blue:0.298},
  hostBg: {red:0.067,green:0.216,blue:0.176},
  gstBg:  {red:0.200,green:0.118,blue:0.298},
  calcBg: {red:0.247,green:0.247,blue:0.247},  // dark row for calc headers
  white:  {red:1,green:1,blue:1},
  accent: {red:0.651,green:0.761,blue:0.894},
  fmlHL:  {red:0.851,green:0.953,blue:0.776},
  fmlHdr: {red:0.200,green:0.620,blue:0.100},
  idBg:   {red:0.941,green:0.918,blue:0.988},
  calcRow:{red:0.961,green:0.965,blue:0.976},
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
const DATE_F = {numberFormat:{type:"DATE",pattern:"yyyy-mm-dd"}}

// Pivot builder
function piv(tSid,srcSid,row,rowCols,vals,filters=[]) {
  return {updateCells:{
    start:{sheetId:tSid,rowIndex:row,columnIndex:0},
    rows:[{values:[{pivotTable:{
      source:{sheetId:srcSid,startRowIndex:0,startColumnIndex:0,endRowIndex:2000,endColumnIndex:N},
      rows:rowCols.map(o=>({sourceColumnOffset:o,showTotals:true,sortOrder:"ASCENDING"})),
      values:vals, filterSpecs:filters,
    }}]}],
    fields:"pivotTable",
  }}
}

const hostF  = {filterCriteria:{visibleValues:["Host"]},  columnOffsetIndex:COL.audGroup}
const guestF = {filterCriteria:{visibleValues:["Guest"]}, columnOffsetIndex:COL.audGroup}
const prospF = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]}, columnOffsetIndex:COL.funnel}
const rtF    = {filterCriteria:{visibleValues:["Retargeting"]}, columnOffsetIndex:COL.funnel}

// Metric sets
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

function numFmtReqs(sid) {
  return [
    cFmt(sid,3,2000,1,2,USD),
    cFmt(sid,3,2000,2,12,INT),
  ]
}

// Label rows builder
function lblRows(title, sections, total=300) {
  const arr=Array.from({length:total},()=>[""])
  arr[0]=[title]; arr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]; arr[2]=[""]
  for(const s of sections) arr[s.row]=[s.label]
  let last=arr.length-1
  while(last>3&&arr[last][0]==="") last--
  return arr.slice(0,last+3)
}

function secFmts(sid,numCols,sections) {
  const r=[]
  r.push(frz(sid,3,1))
  r.push(cFmt(sid,0,1,0,numCols,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}))
  r.push(cFmt(sid,1,2,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}))
  r.push(cFmt(sid,2,3,0,numCols,{backgroundColor:C.navy}))
  r.push(rh(sid,0,1,48)); r.push(rh(sid,1,2,22)); r.push(rh(sid,2,3,8))
  for(const s of sections) {
    const bg=s.t==="host"?C.hostBg:s.t==="guest"?C.gstBg:s.t==="calc"?C.calcBg:C.secBg
    r.push(cFmt(sid,s.row,s.row+1,0,numCols,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:s.big?13:11},verticalAlignment:"MIDDLE",padding:{top:s.big?10:7,bottom:s.big?10:7}}))
    r.push(rh(sid,s.row,s.row+1,s.big?36:28))
  }
  return r
}

// ── Calculated metrics block ──────────────────────────────────────────────
// Returns rows for a formula-driven CPA/CVR table anchored at sheetRow (1-based)
// Pulls SUMIF from Platform Data by Audience Group
const AVG_BOOKING = 35   // placeholder avg booking value ($)

function calcMetricsHost(sheetRow) {
  const PD = "'Platform Data'"
  const s  = (col)=>`IFERROR(SUMIF(${PD}!N:N,"Host",${PD}!${col}:${col}),0)`
  const r  = sheetRow
  return [
    ["HOST CALCULATED METRICS","Value","Benchmark",""],
    ["Spend",                  `=${s("Z")}`,      "",       "Total host ad spend"],
    ["Impressions",            `=${s("AA")}`,     "",       ""],
    ["Link Clicks",            `=${s("AC")}`,     "",       ""],
    ["Host Clicks (P1)",       `=${s("AD")}`,     "",       "become_host_click"],
    ["Onboarding Started (P2)",`=${s("AE")}`,     "",       "host_onboarding_started"],
    ["Listings Created (P3)",  `=${s("AF")}`,     "",       "listing_created"],
    ["","","",""],
    ["CTR (Clicks / Imps)",    `=IFERROR(B${r+3}/B${r+2},0)`,  "1.50%",  ""],
    ["CPC (Spend / Clicks)",   `=IFERROR(B${r+1}/B${r+3},0)`,  "$1.50",  ""],
    ["CVR P1 (BHC / Clicks)",  `=IFERROR(B${r+4}/B${r+3},0)`,  "8.00%",  ""],
    ["CVR P2 (HOS / BHC)",     `=IFERROR(B${r+5}/B${r+4},0)`,  "40.00%", ""],
    ["CVR P3 (LC / HOS)",      `=IFERROR(B${r+6}/B${r+5},0)`,  "20.00%", ""],
    ["CAC — Host Click",       `=IFERROR(B${r+1}/B${r+4},0)`,  "$12.00", "Spend / P1 events"],
    ["CAC — Onboarding",       `=IFERROR(B${r+1}/B${r+5},0)`,  "$30.00", "Spend / P2 events"],
    ["CAC — Listing Created",  `=IFERROR(B${r+1}/B${r+6},0)`,  "$60.00", "Spend / P3 events"],
  ]
}

function calcMetricsGuest(sheetRow) {
  const PD = "'Platform Data'"
  const s  = (col)=>`IFERROR(SUMIF(${PD}!N:N,"Guest",${PD}!${col}:${col}),0)`
  const r  = sheetRow
  return [
    ["GUEST CALCULATED METRICS","Value","Benchmark",""],
    ["Spend",                   `=${s("Z")}`,              "",       "Total guest ad spend"],
    ["Impressions",             `=${s("AA")}`,             "",       ""],
    ["Link Clicks",             `=${s("AC")}`,             "",       ""],
    ["Checkout Initiated",      `=${s("AG")}`,             "",       "checkout_initiated"],
    ["New Bookings (Purchase)", `=${s("AH")}`,             "",       "Purchase conversions"],
    ["","","",""],
    ["CTR (Clicks / Imps)",     `=IFERROR(B${r+3}/B${r+2},0)`,  "1.50%",  ""],
    ["CPC (Spend / Clicks)",    `=IFERROR(B${r+1}/B${r+3},0)`,  "$1.50",  ""],
    ["CVR (Checkout / Clicks)", `=IFERROR(B${r+4}/B${r+3},0)`,  "8.00%",  "Initiate checkout rate"],
    ["CVR (Purchase / Checkout)",`=IFERROR(B${r+5}/B${r+4},0)`, "35.00%", "Checkout-to-purchase rate"],
    ["CVR (Purchase / Clicks)", `=IFERROR(B${r+5}/B${r+3},0)`,  "3.00%",  "Overall click-to-purchase"],
    ["CPA (Spend / Purchase)",  `=IFERROR(B${r+1}/B${r+5},0)`,  "$80.00", "Cost per new booking"],
    ["Revenue (Bookings × $35)",`=IFERROR(B${r+5}*${AVG_BOOKING},0)`, "", "Gross Booking Value proxy"],
    ["ROAS (Revenue / Spend)",  `=IFERROR((B${r+5}*${AVG_BOOKING})/B${r+1},0)`, "1.50×", "Return on ad spend"],
  ]
}

// Format a calculated metrics block
function calcFmtReqs(sid, sheetRow, isHost) {
  const r0 = sheetRow-1  // 0-based
  const bg = isHost ? C.hostBg : C.gstBg
  return [
    // Header row
    cFmt(sid,r0,r0+1,0,4,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}}),
    rh(sid,r0,r0+1,28),
    // Raw metric rows (rows r0+1 to r0+6)
    cFmt(sid,r0+1,r0+7,0,4,{backgroundColor:C.calcRow,textFormat:{fontSize:10}}),
    cFmt(sid,r0+1,r0+2,1,2,USD),  // Spend
    cFmt(sid,r0+2,r0+4,1,2,INT),  // Imps, Clicks
    cFmt(sid,r0+4,r0+7,1,2,INT),  // events
    // Calc metric rows (rows r0+8 to r0+16)
    cFmt(sid,r0+8,r0+17,0,4,{backgroundColor:{red:0.98,green:0.98,blue:0.98},textFormat:{fontSize:10}}),
    cFmt(sid,r0+8,r0+9,1,2,PCT),  // CTR
    cFmt(sid,r0+9,r0+10,1,2,USD), // CPC
    cFmt(sid,r0+10,r0+14,1,2,PCT),// CVRs
    cFmt(sid,r0+14,r0+16,1,2,USD),// CPA / Revenue
    cFmt(sid,r0+16,r0+17,1,2,DEC2),// ROAS
    // Benchmark col = italic grey
    cFmt(sid,r0,r0+17,2,3,{textFormat:{italic:true,foregroundColor:{red:0.5,green:0.5,blue:0.5},fontSize:9}}),
    // Notes col = italic grey
    cFmt(sid,r0,r0+17,3,4,{textFormat:{italic:true,foregroundColor:{red:0.5,green:0.5,blue:0.5},fontSize:9}}),
  ]
}

// ── Platform Data formatting ──────────────────────────────────────────────
async function formatPlatformData(sid) {
  const reqs = [
    frz(sid,1,0),
    cFmt(sid,0,1,0,N,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    ...FORMULA_COLS.map(c=>cFmt(sid,0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}})),
    ...FORMULA_COLS.map(c=>cFmt(sid,1,2000,c,c+1,{backgroundColor:C.fmlHL})),
    cFmt(sid,1,2000,0,1,DATE_F),
    cFmt(sid,1,2000,COL.spend,COL.spend+1,USD),
    cFmt(sid,1,2000,COL.imps,N,INT),
    cFmt(sid,1,2000,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cw(sid,0,1,100),cw(sid,1,2,50),cw(sid,2,3,50),cw(sid,3,4,185),
    cw(sid,4,5,70),cw(sid,5,6,50),
    cw(sid,6,7,75),cw(sid,7,8,240),cw(sid,8,9,75),cw(sid,9,10,255),cw(sid,10,11,65),cw(sid,11,12,160),
    cw(sid,12,13,115),cw(sid,13,14,105),cw(sid,14,15,115),cw(sid,15,16,155),cw(sid,16,17,170),cw(sid,17,18,75),
    cw(sid,18,19,110),cw(sid,19,20,80),cw(sid,20,21,65),cw(sid,21,22,85),cw(sid,22,23,90),cw(sid,23,24,195),cw(sid,24,25,170),
    cw(sid,25,35,85),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:reqs}})
}

// ── Apply formatting to a Drive report file ───────────────────────────────
async function formatDriveFile(fileId, isRaw=false) {
  const m    = await sheets.spreadsheets.get({spreadsheetId:fileId})
  const sid  = m.data.sheets?.[0]?.properties?.sheetId ?? 0
  const DARK = C.ink, WHITE = C.white
  const rawHdr = {red:0.231,green:0.290,blue:0.420}  // slate blue for raw
  const hdrBg  = isRaw ? rawHdr : DARK
  const rawRowBg = {red:0.965,green:0.973,blue:0.992}
  const cc = (r1,r2,c1,c2,f)=>cFmt(sid,r1,r2,c1,c2,f)
  const cw2= (a,b,px)=>cw(sid,a,b,px)
  const reqs = [
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    cc(0,1,0,N,{backgroundColor:hdrBg,textFormat:{foregroundColor:WHITE,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    ...FORMULA_COLS.map(c=>cc(0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:WHITE,bold:true,fontSize:10}})),
    ...FORMULA_COLS.map(c=>cc(1,500,c,c+1,{backgroundColor:C.fmlHL})),
    ...(isRaw ? [cc(1,500,0,N,{backgroundColor:rawRowBg})] : []),
    cc(1,500,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,500,COL.spend,COL.spend+1,USD),
    cc(1,500,COL.imps,N,INT),
    cw2(0,1,100),cw2(1,2,50),cw2(2,3,50),cw2(3,4,185),cw2(4,5,70),cw2(5,6,50),
    cw2(6,7,75),cw2(7,8,240),cw2(8,9,75),cw2(9,10,255),cw2(10,11,65),cw2(11,12,160),
    cw2(12,13,115),cw2(13,14,105),cw2(14,15,115),cw2(15,16,155),cw2(16,17,170),cw2(17,18,75),
    cw2(18,19,110),cw2(19,20,80),cw2(20,21,65),cw2(21,22,85),cw2(22,23,90),cw2(23,24,195),cw2(24,25,170),
    cw2(25,35,85),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:fileId,requestBody:{requests:reqs}})
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔄  thrml Rebuild v4 — 4/15–4/22 + calculated metrics\n")

  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  const SRC = tabMap["Platform Data"]

  // ── 1. Load Namer + Lookup ────────────────────────────────────────────────
  console.log("📖 Loading Namer...")
  const [namer,lookup] = await Promise.all([loadNamer(),loadLookup()])
  console.log(`   ${namer.camps.length} campaigns | ${namer.adsets.length} ad sets | ${namer.creatives.length} ads`)

  // ── 2. Generate 4/15 – 4/22 (8 days) ────────────────────────────────────
  const START = new Date("2026-04-15T12:00:00Z")
  const END   = new Date("2026-04-22T12:00:00Z")  // yesterday
  const dates = []
  for(let d=new Date(START); d<=END; d.setDate(d.getDate()+1)) dates.push(d.toISOString().slice(0,10))
  console.log(`\n📅 Generating ${dates.length} days: ${dates[0]} → ${dates[dates.length-1]}`)

  const allRows = []
  for(const dateStr of dates) {
    const sheetRowStart = 2 + allRows.length
    allRows.push(...genDay(namer,lookup,dateStr,sheetRowStart))
  }
  console.log(`   ${allRows.length} total rows (${namer.creatives.length} ads × ${dates.length} days)`)

  // ── 3. Write Platform Data ────────────────────────────────────────────────
  console.log("\n📊 Writing Platform Data...")
  for(const [label,sid] of [["Master Report",MASTER],["Finance Tracker",FINANCE]]) {
    await sheets.spreadsheets.values.clear({spreadsheetId:sid,range:"Platform Data!A1:AI2000"})
    await sheets.spreadsheets.values.update({
      spreadsheetId:sid,range:"Platform Data!A1",
      valueInputOption:"USER_ENTERED",
      requestBody:{values:[HEADERS,...allRows]}
    })
    console.log(`   ✅ ${label}: ${allRows.length} rows, ${N} columns`)
  }
  await formatPlatformData(SRC)
  console.log("   ✅ Platform Data formatted")

  // ── 4. Write Raw + Cleaned per-day Drive files ────────────────────────────
  console.log("\n📁 Writing Drive files per day...")
  for(const dateStr of dates) {
    const dt = new Date(dateStr+"T12:00:00Z")
    const mm = dt.toLocaleDateString("en-US",{month:"2-digit",timeZone:"UTC"})
    const dd = dt.toLocaleDateString("en-US",{day:"2-digit",timeZone:"UTC"})
    const yy = dt.toLocaleDateString("en-US",{year:"2-digit",timeZone:"UTC"})
    const formatted = `${mm}.${dd}.${yy}`
    const dayRows = allRows.filter(r=>r[0]===dateStr)
    const metaRows = dayRows.filter(r=>r[4]==="Meta")
    console.log(`  ${dateStr}: ${dayRows.length} rows (${metaRows.length} Meta)`)
    const { monthId:rawMo }     = await getDatedFolder(RAW_ROOT,     dt)
    const { monthId:cleanedMo } = await getDatedFolder(CLEANED_ROOT, dt)
    const rawFid     = await writeSheet(rawMo,     `Meta_Daily Report_Raw_${formatted}`,     HEADERS, metaRows)
    const cleanedFid = await writeSheet(cleanedMo, `Meta_Daily Report_Cleaned_${formatted}`, HEADERS, metaRows)
    if(rawFid)     await formatDriveFile(rawFid, true)
    if(cleanedFid) await formatDriveFile(cleanedFid, false)
  }

  // ── 5. Rebuild Performance Report ────────────────────────────────────────
  console.log("\n📊 Rebuilding Performance Report...")
  const PR = tabMap["Performance Report"]
  const HB = 56, GB = 160  // host/guest base rows (0-indexed)

  // Host calc block starts at HB+3, guest at GB+3
  const hostCalcRow  = HB+4   // 1-based sheet row
  const guestCalcRow = GB+4

  const prSecs = [
    {row:3,  label:"▌ OVERALL  ·  By Platform",     t:"overall"},
    {row:12, label:"▌ OVERALL  ·  By Phase",          t:"overall"},
    {row:21, label:"▌ OVERALL  ·  By Funnel Stage",   t:"overall"},
    {row:30, label:"▌ OVERALL  ·  By Audience Group", t:"overall"},
    {row:HB,   label:"⬛  HOST PERFORMANCE",           t:"host",big:true},
    {row:HB+2, label:"▌ HOST  ·  Calculated Metrics (KPI, CVR, CAC)", t:"host"},
    {row:HB+20,label:"▌ HOST  ·  By Phase",            t:"host"},
    {row:HB+29,label:"▌ HOST  ·  By Funnel Stage",     t:"host"},
    {row:HB+38,label:"▌ HOST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"host"},
    {row:HB+63,label:"▌ HOST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"host"},
    {row:GB,   label:"⬛  GUEST PERFORMANCE",          t:"guest",big:true},
    {row:GB+2, label:"▌ GUEST  ·  Calculated Metrics (KPI, CVR, CPA, ROAS)",t:"guest"},
    {row:GB+20,label:"▌ GUEST  ·  By Phase",           t:"guest"},
    {row:GB+29,label:"▌ GUEST  ·  By Funnel Stage",    t:"guest"},
    {row:GB+38,label:"▌ GUEST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"guest"},
    {row:GB+63,label:"▌ GUEST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"guest"},
  ]

  const prLabels = lblRows("thrml — Performance Report", prSecs.map(s=>({row:s.row,label:s.label})), GB+90)
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Performance Report!A1:Z700"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:prLabels}})

  // Insert calc metric tables
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`Performance Report!A${hostCalcRow}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:calcMetricsHost(hostCalcRow)}})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`Performance Report!A${guestCalcRow}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:calcMetricsGuest(guestCalcRow)}})

  const prPivots = [
    piv(PR,SRC,4, [COL.platform],ALL_MET),
    piv(PR,SRC,13,[COL.phase],   ALL_MET),
    piv(PR,SRC,22,[COL.funnel],  ALL_MET),
    piv(PR,SRC,31,[COL.audGroup],ALL_MET),
    piv(PR,SRC,HB+21,[COL.phase],   HST_MET,[hostF]),
    piv(PR,SRC,HB+30,[COL.funnel],  HST_MET,[hostF]),
    piv(PR,SRC,HB+39,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,prospF]),
    piv(PR,SRC,HB+64,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,rtF]),
    piv(PR,SRC,GB+21,[COL.phase],   GST_MET,[guestF]),
    piv(PR,SRC,GB+30,[COL.funnel],  GST_MET,[guestF]),
    piv(PR,SRC,GB+39,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,prospF]),
    piv(PR,SRC,GB+64,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,rtF]),
  ]

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...prPivots,
    ...secFmts(PR,9,prSecs),
    ...numFmtReqs(PR),
    ...calcFmtReqs(PR, hostCalcRow,  true),
    ...calcFmtReqs(PR, guestCalcRow, false),
    // Benchmark col width
    cw(PR,0,1,250),cw(PR,1,2,110),cw(PR,2,3,120),cw(PR,3,4,110),
    cw(PR,4,5,140),cw(PR,5,6,155),cw(PR,6,7,130),cw(PR,7,8,90),cw(PR,8,9,135),
  ]}})
  console.log("   ✅ Performance Report: 12 pivots + calc metric tables")

  // ── 6. Rebuild Host + Guest Creative tabs ─────────────────────────────────
  console.log("\n📊 Rebuilding creative tabs...")
  const crSecs = [
    {row:3,  col:COL.angle,   label:"▌ BY ANGLE"},
    {row:17, col:COL.fmtType, label:"▌ BY FORMAT TYPE"},
    {row:28, col:COL.length,  label:"▌ BY LENGTH"},
    {row:39, col:COL.ratio,   label:"▌ BY ASPECT RATIO"},
    {row:50, col:COL.cta,     label:"▌ BY CTA"},
    {row:62, col:COL.tgtName, label:"▌ BY TARGETING NAME"},
  ]
  for(const [tabTitle,filt,met,t] of [
    ["Host Creative",  hostF,  HST_MET,"host"],
    ["Guest Creative", guestF, GST_MET,"guest"],
  ]) {
    const sid = tabMap[tabTitle]; if(!sid){console.log(`  ⚠️ '${tabTitle}' not found`);continue}
    const crLabels = lblRows(`thrml — ${tabTitle}`,crSecs.map(s=>({row:s.row,label:s.label})),100)
    await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:`'${tabTitle}'!A1:Z300`})
    await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`'${tabTitle}'!A1`,
      valueInputOption:"USER_ENTERED",requestBody:{values:crLabels}})
    const bg = t==="host"?C.hostBg:C.gstBg
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      ...crSecs.map(s=>piv(sid,SRC,s.row+1,[s.col],met,[filt])),
      frz(sid,3,1),
      cFmt(sid,0,1,0,9,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cFmt(sid,1,2,0,9,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cFmt(sid,2,3,0,9,{backgroundColor:C.navy}),
      rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
      ...crSecs.map(s=>cFmt(sid,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
      ...crSecs.map(s=>rh(sid,s.row,s.row+1,28)),
      ...numFmtReqs(sid),
      cw(sid,0,1,190),cw(sid,1,2,110),cw(sid,2,3,120),cw(sid,3,4,110),
      cw(sid,4,5,140),cw(sid,5,6,155),cw(sid,6,7,130),cw(sid,7,8,90),cw(sid,8,9,135),
    ]}})
    console.log(`   ✅ ${tabTitle}: 6 pivots`)
  }

  // ── 7. Rebuild Spend Breakdown ────────────────────────────────────────────
  console.log("\n📊 Rebuilding Spend Breakdown...")
  const SB = tabMap["Spend Breakdown"]
  const sbSecs = [
    {row:3, col:COL.platform,label:"▌ BY PLATFORM"},
    {row:13,col:COL.phase,   label:"▌ BY PHASE"},
    {row:23,col:COL.month,   label:"▌ BY MONTH"},
    {row:33,col:COL.week,    label:"▌ BY WEEK"},
    {row:43,col:COL.geo,     label:"▌ BY GEO"},
    {row:52,col:COL.date,    label:"▌ BY DATE"},
  ]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:lblRows("thrml — Spend Breakdown",sbSecs.map(s=>({row:s.row,label:s.label})),100)}})
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...sbSecs.map(s=>piv(SB,SRC,s.row+1,[s.col],SPD_MET)),
    frz(SB,3,1),
    cFmt(SB,0,1,0,4,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(SB,1,2,0,4,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(SB,2,3,0,4,{backgroundColor:C.navy}),
    ...sbSecs.map(s=>cFmt(SB,s.row,s.row+1,0,4,{backgroundColor:C.secBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
    ...sbSecs.map(s=>rh(SB,s.row,s.row+1,28)),
    rh(SB,0,1,48),rh(SB,1,2,22),rh(SB,2,3,8),
    ...numFmtReqs(SB),
    cw(SB,0,1,210),cw(SB,1,2,115),cw(SB,2,3,120),cw(SB,3,4,110),
  ]}})
  console.log("   ✅ Spend Breakdown: 6 pivots")

  // Final summary
  const finalMeta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  console.log("\n📋 Master Report tabs:")
  finalMeta.data.sheets?.forEach((s,i)=>console.log(`  ${i+1}. ${s.properties.title}`))
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e=>{console.error("❌",e.message);process.exit(1)})
