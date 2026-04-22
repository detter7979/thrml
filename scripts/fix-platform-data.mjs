/**
 * thrml Platform Data + Pivot Rebuild — Final Fix
 * Correct column order as specified:
 * Date | Year* | Month* | Week* | Platform | Phase |
 * Campaign ID | Campaign Name | Ad Set ID | Ad Set Name | Ad ID | Ad Name |
 * Campaign Objective | Audience Group | Funnel Stage |
 * Targeting Tactic | Targeting Name* | Geo |
 * Angle | Format Type | Length | Aspect Ratio | CTA | Hook Copy | Opt. Event |
 * Spend ($) | Impressions | Reach | Link Clicks |
 * become_host_click | host_onboarding_started | listing_created | Purchase | Video Views 100%
 *
 * * = formula column (Year/Month/Week = date formulas, Targeting Name = VLOOKUP)
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json","utf8"))
const auth  = new google.auth.GoogleAuth({ credentials:creds,
  scopes:["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version:"v4", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER   = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// ── Final correct column order + offsets ─────────────────────────────────
const HEADERS = [
  "Date",                    // A  0
  "Year",                    // B  1   =YEAR(A)
  "Month",                   // C  2   =TEXT(A,"Mmm")
  "Week",                    // D  3   =CONCATENATE(...)
  "Platform",                // E  4
  "Phase",                   // F  5
  "Campaign ID",             // G  6
  "Campaign Name",           // H  7
  "Ad Set ID",               // I  8
  "Ad Set Name",             // J  9
  "Ad ID",                   // K  10
  "Ad Name",                 // L  11
  "Campaign Objective",      // M  12
  "Audience Group",          // N  13
  "Funnel Stage",            // O  14
  "Targeting Tactic",        // P  15
  "Targeting Name",          // Q  16  =VLOOKUP(spaceType,'Targeting Lookup')
  "Geo",                     // R  17
  "Angle",                   // S  18
  "Format Type",             // T  19
  "Length",                  // U  20
  "Aspect Ratio",            // V  21
  "CTA",                     // W  22
  "Hook Copy",               // X  23
  "Opt. Event",              // Y  24
  "Spend ($)",               // Z  25
  "Impressions",             // AA 26
  "Reach",                   // AB 27
  "Link Clicks",             // AC 28
  "become_host_click",       // AD 29
  "host_onboarding_started", // AE 30
  "listing_created",         // AF 31
  "Purchase",                // AG 32
  "Video Views 100%",        // AH 33
]

// Column indices for pivot table offsets
const COL = {
  date:0, year:1, month:2, week:3, platform:4,
  phase:5, campId:6, campName:7, asId:8, asName:9, adId:10, adName:11,
  campObj:12, audGroup:13, funnel:14, tgtTactic:15, tgtName:16, geo:17,
  angle:18, fmtType:19, length:20, ratio:21, cta:22, hook:23, optEvent:24,
  spend:25, imps:26, reach:27, clicks:28,
  bhc:29, hos:30, lc:31, pur:32, vv100:33,
}

// Formula-driven columns (highlighted)
const FORMULA_COLS = [1, 2, 3, 16]  // Year, Month, Week, Targeting Name

// ── Helper: column letter from 0-based index ─────────────────────────────
function col(n) { return n < 26 ? String.fromCharCode(65+n) : "A"+String.fromCharCode(65+n-26) }

// ── Helpers: value maps + parsers ─────────────────────────────────────────
const PLATFORM_D  = { META:"Meta", GOOG:"Google", SNAP:"Snapchat", TIKTOK:"TikTok" }
const OBJECTIVE_D = { REACH:"Reach", LEAD:"Lead", CONV:"Conversion", AWARE:"Awareness" }
const FUNNEL_D    = { PROSP:"Prospecting", LAL:"Lookalike", LAL1:"Lookalike", LAL2:"Lookalike", RT:"Retargeting" }
const GEO_D       = { SEA:"Seattle", ALL:"All", US:"US" }
const TACTIC_MAP  = { int:"Interest", lal1:"LAL 1%", lal2:"LAL 2%", lal:"LAL",
                      rt_checkout:"Retargeting - Checkout", rt_listing:"Retargeting - Listing", crmatch:"CRM Match" }
const ALLCAPS = new Set(["UGC","LAL","RSA","CRM","CTR","CPM","CPC","CPA","ROAS","CAC","ROI","PMAX","REELS","FEED","SEA","US","NA","META","GOOG"])
const na = v => (!v || v==="-" || v==="—" || v==="" ? "NA" : v)
const tc = s => {
  if(!s||s==="NA") return "NA"
  if(/^[CP]\d{3}$/.test(s)||/^(AS|AD)\d{3}$/.test(s)||/^P\d$/.test(s)) return s
  return s.replace(/_/g," ").replace(/\w+/g,w=>ALLCAPS.has(w.toUpperCase())?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase())
}
const fmt = (n,d=2) => Number(n).toFixed(d)
const jit = (base,pct=0.18) => base*(1+(Math.random()-0.5)*pct)

// ── Date helpers ──────────────────────────────────────────────────────────
function dateFields(isoDate) {
  const d = new Date(isoDate+"T12:00:00Z")
  const year = String(d.getUTCFullYear())
  const month = d.toLocaleDateString("en-US",{month:"short",timeZone:"UTC"})
  const tmp = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  const dow = tmp.getUTCDay()||7
  tmp.setUTCDate(tmp.getUTCDate()+4-dow)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1))
  const weekNum = Math.ceil((((tmp-yearStart)/86400000)+1)/7)
  const mon = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  mon.setUTCDate(mon.getUTCDate()-((mon.getUTCDay()||7)-1))
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate()+6)
  const pad = n=>String(n).padStart(2,"0")
  const yy = String(d.getUTCFullYear()).slice(2)
  return {
    year,
    month,
    week:`Week ${weekNum} (${pad(mon.getUTCMonth()+1)}/${pad(mon.getUTCDate())} - ${pad(sun.getUTCMonth()+1)}/${pad(sun.getUTCDate())}/${yy})`
  }
}

// ── Load Namer data ───────────────────────────────────────────────────────
async function loadNamer() {
  const [cb,ab,cr] = await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Campaign Builder!A2:L20"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Ad Set Builder!A2:J30"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Creative Builder!A2:Q25"}),
  ])
  // Campaign Builder: ID(0) Platform(1) Phase(2) Funnel(3) Objective(4) Goal(5) AudType(6) Geo(7) CampName(8) Event(9)
  const camps = (cb.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0], platform:r[1], phase:r[2], funnel:r[3], objective:r[4],
    audType:r[6], geo:r[7], name:r[8], event:r[9]
  }))
  // Ad Set Builder: AsID(0) CampID(1) CampName(2) SpaceType(3) AudSrc(4) Placement(5) Details(6) AdSetName(7)
  const adsets = (ab.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0], campId:r[1], spaceType:r[3], audSrc:r[4], placement:r[5], name:r[7]
  }))
  // Creative Builder: AdID(0) AsID(1) CampID(2) Concept(3) Format(4) Length(5) Size(6) Variant(7) CTA(8) AdSetName(9) AdName(10) Hook(11)
  const creatives = (cr.data.values??[]).filter(r=>r[0]).map(r=>({
    id:r[0], asId:r[1], campId:r[2], concept:r[3], format:r[4],
    length:r[5], size:r[6], cta:r[8], adName:r[10], hook:r[11]
  }))
  return { camps, adsets, creatives }
}

// ── Load Targeting Lookup ─────────────────────────────────────────────────
async function loadLookup() {
  const defaults = { gen:"General Interest", sauna:"Sauna Interest", hottub:"Hot Tub Interest",
    coldplunge:"Cold Plunge Interest", income:"Income / Earn Interest", wellness:"Wellness Interest",
    biohacking:"Biohacking Interest", checkout_rt:"Checkout Retargeting",
    listing_rt:"Listing View Retargeting", all_spaces:"All Spaces" }
  try {
    const r = await sheets.spreadsheets.values.get({spreadsheetId:MASTER, range:"Targeting Lookup!A2:B100"})
    return (r.data.values??[]).reduce((acc,row)=>{ if(row[0]&&row[1]) acc[row[0].toLowerCase().trim()]=row[1].trim(); return acc }, {...defaults})
  } catch { return defaults }
}

// ── Generate cleaned rows for one date ────────────────────────────────────
// Returns rows in the exact HEADERS order above
function genRows(namer, lookup, dateStr, sheetRowStart) {
  const campMap  = Object.fromEntries(namer.camps.map(c=>[c.id,c]))
  const adsetMap = Object.fromEntries(namer.adsets.map(a=>[a.id,a]))
  const rows = []

  for (const cr of namer.creatives) {
    const camp  = campMap[cr.campId]; if(!camp) continue
    const adset = adsetMap[cr.asId];  if(!adset) continue
    const sheetRow = sheetRowStart + rows.length  // 1-based row for this row

    const ph      = parseInt(camp.phase?.replace("P","")||"1")
    const isVideo = ["video","ugc"].includes(cr.format?.toLowerCase())
    const isGoog  = camp.platform?.toUpperCase()==="GOOG"

    const spend  = jit(isGoog?24:(ph===1?13:ph===2?29:23))
    const imps   = Math.round(jit(isGoog?3800:(ph===1?9500:ph===2?7200:3400)))
    const reach  = Math.round(imps*0.91)
    const clicks = Math.round(jit(isGoog?260:imps*0.022))
    const bhc    = camp.event==="become_host_click"       ? Math.max(0,Math.round(jit(16,0.45))) : 0
    const hos    = camp.event==="host_onboarding_started" ? Math.max(0,Math.round(jit(11,0.5)))  : 0
    const lc     = camp.event==="listing_created"         ? Math.max(0,Math.round(jit(3,0.6)))   : 0
    const pur    = camp.event==="Purchase"                ? Math.max(0,Math.round(jit(2,0.7)))   : 0
    const vv100  = isVideo ? Math.round(jit(imps*0.07,0.3)) : 0

    const df       = dateFields(dateStr)
    const platform = PLATFORM_D[camp.platform?.toUpperCase()] ?? camp.platform
    const objective= tc(OBJECTIVE_D[camp.objective?.toUpperCase()] ?? camp.objective)
    const funnel   = tc(FUNNEL_D[camp.funnel?.toUpperCase()] ?? camp.funnel)
    const audGroup = tc(camp.audType)
    const geo      = GEO_D[camp.geo?.toUpperCase()] ?? tc(camp.geo)
    const tactic   = TACTIC_MAP[adset.audSrc?.toLowerCase()] ?? tc(adset.audSrc)
    const spaceKey = adset.spaceType?.toLowerCase() ?? ""
    const tgtName  = lookup[spaceKey] ?? tc(adset.spaceType)
    const placement= tc(adset.placement)
    const angle    = tc(cr.concept)
    const fmtType  = tc(cr.format)
    const length   = na(cr.length)
    const ratio    = na(cr.size)
    const cta      = tc(cr.cta?.replace(/_/g," "))
    const hook     = na(cr.hook)
    const optEvent = na(camp.event)

    rows.push([
      dateStr,                                                   // A  Date (hard)
      `=YEAR(A${sheetRow})`,                                     // B  Year (formula)
      `=TEXT(A${sheetRow},"Mmm")`,                               // C  Month (formula)
      `=CONCATENATE("Week ",ISOWEEKNUM(A${sheetRow})," (",` +
        `TEXT(A${sheetRow}-WEEKDAY(A${sheetRow},2)+1,"MM/DD"),` +
        `" - ",TEXT(A${sheetRow}-WEEKDAY(A${sheetRow},2)+7,"MM/DD/YY"),")")`, // D Week (formula)
      platform,                                                  // E  Platform
      na(camp.phase),                                            // F  Phase
      camp.id,                                                   // G  Campaign ID
      camp.name,                                                 // H  Campaign Name
      adset.id,                                                  // I  Ad Set ID
      adset.name,                                                // J  Ad Set Name
      cr.id,                                                     // K  Ad ID
      cr.adName ?? cr.id,                                        // L  Ad Name
      objective,                                                 // M  Campaign Objective
      audGroup,                                                  // N  Audience Group
      funnel,                                                    // O  Funnel Stage
      tactic,                                                    // P  Targeting Tactic
      `=IFERROR(VLOOKUP(INDEX(SPLIT(J${sheetRow},"_"),1,8),'Targeting Lookup'!$A:$B,2,FALSE),"${tgtName}")`, // Q Targeting Name (formula with fallback)
      geo,                                                       // R  Geo
      angle,                                                     // S  Angle
      fmtType,                                                   // T  Format Type
      length,                                                    // U  Length
      ratio,                                                     // V  Aspect Ratio
      cta,                                                       // W  CTA
      hook,                                                      // X  Hook Copy
      optEvent,                                                  // Y  Opt. Event
      fmt(spend),                                                // Z  Spend ($)
      String(imps),                                              // AA Impressions
      String(reach),                                             // AB Reach
      String(clicks),                                            // AC Link Clicks
      String(bhc),                                               // AD become_host_click
      String(hos),                                               // AE host_onboarding_started
      String(lc),                                                // AF listing_created
      String(pur),                                               // AG Purchase
      String(vv100),                                             // AH Video Views 100%
    ])
  }
  return rows
}

// ── Colours + format helpers ──────────────────────────────────────────────
const C = {
  ink:    { red:0.047, green:0.086, blue:0.157 },
  navy:   { red:0.078, green:0.133, blue:0.216 },
  secBg:  { red:0.133, green:0.196, blue:0.298 },
  hostBg: { red:0.067, green:0.216, blue:0.176 },
  gstBg:  { red:0.200, green:0.118, blue:0.298 },
  white:  { red:1, green:1, blue:1 },
  accent: { red:0.651, green:0.761, blue:0.894 },
  fmlHL:  { red:0.851, green:0.953, blue:0.776 },
  fmlHdr: { red:0.200, green:0.620, blue:0.100 },
  idBg:   { red:0.941, green:0.918, blue:0.988 },
}
const rng  = (s,r1,r2,c1,c2)=>({sheetId:s,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cFmt = (s,r1,r2,c1,c2,f)=>({repeatCell:{range:rng(s,r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const rh   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"ROWS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const frz  = (s,r,c=0)=>({updateSheetProperties:{properties:{sheetId:s,gridProperties:{frozenRowCount:r,frozenColumnCount:c}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})
const USD  = {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}}
const INT  = {numberFormat:{type:"NUMBER",pattern:"#,##0"}}
const DATE = {numberFormat:{type:"DATE",pattern:"yyyy-mm-dd"}}

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
      fields:"pivotTable",
    }
  }
}

const hostF  = {filterCriteria:{visibleValues:["Host"]},  columnOffsetIndex:COL.audGroup}
const guestF = {filterCriteria:{visibleValues:["Guest"]}, columnOffsetIndex:COL.audGroup}
const prospF = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]}, columnOffsetIndex:COL.funnel}
const rtF    = {filterCriteria:{visibleValues:["Retargeting"]}, columnOffsetIndex:COL.funnel}

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

// Apply USD + INT formatting to all data columns in a pivot sheet
function numFmtReqs(sid) {
  return [
    cFmt(sid,3,2000,1,2,USD),   // col B = Spend → USD
    cFmt(sid,3,2000,2,12,INT),  // cols C+ = INT
  ]
}

// Sparse label rows builder
function labelRows(title, sections, totalRows=300) {
  const arr = Array.from({length:totalRows},()=>[""])
  arr[0]=[title]
  arr[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  arr[2]=[""]
  for (const s of sections) arr[s.row]=[s.label]
  let last=arr.length-1
  while(last>3 && arr[last][0]==="") last--
  return arr.slice(0,last+3)
}

function secFmts(sid, numCols, sections) {
  const r=[]
  r.push(frz(sid,3,1))
  r.push(cFmt(sid,0,1,0,numCols,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}))
  r.push(cFmt(sid,1,2,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}))
  r.push(cFmt(sid,2,3,0,numCols,{backgroundColor:C.navy}))
  r.push(rh(sid,0,1,48)); r.push(rh(sid,1,2,22)); r.push(rh(sid,2,3,8))
  for (const s of sections) {
    const bg = s.t==="host"?C.hostBg:s.t==="guest"?C.gstBg:C.secBg
    r.push(cFmt(sid,s.row,s.row+1,0,numCols,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:s.big?13:11},verticalAlignment:"MIDDLE",padding:{top:s.big?10:7,bottom:s.big?10:7}}))
    r.push(rh(sid,s.row,s.row+1,s.big?36:28))
  }
  return r
}

// KPI formula block — references Platform Data by column letter
function kpiRows(audGroup, sheetRow) {
  // Audience Group = col N (index 13), Spend = Z (25), bhc=AD(29), hos=AE(30), lc=AF(31), pur=AG(32), clicks=AC(28), imps=AA(26)
  const PD = "'Platform Data'"
  const s = (metCol)=>`IFERROR(SUMIF(${PD}!N:N,"${audGroup}",${PD}!${metCol}:${metCol}),0)`
  const r = sheetRow
  if(audGroup==="Host") return [
    ["Total Ad Spend",               `=${s("Z")}`,                        "", "Host ad spend"],
    ["Host Clicks (P1 events)",      `=${s("AD")}`,                       "", "become_host_click"],
    ["Host Onboarding (P2 events)",  `=${s("AE")}`,                       "", "host_onboarding_started"],
    ["Listings Created (P3 events)", `=${s("AF")}`,                       "", "listing_created"],
    ["","","",""],
    ["CAC — Host Click",             `=IFERROR(B${r}/B${r+1},"—")`,       "", "Cost per P1 event"],
    ["CAC — Onboarding",             `=IFERROR(B${r}/B${r+2},"—")`,       "", "Cost per P2 event"],
    ["CAC — Listing Created",        `=IFERROR(B${r}/B${r+3},"—")`,       "", "Cost per P3 event"],
  ]
  return [
    ["Total Ad Spend",               `=${s("Z")}`,                        "", "Guest ad spend"],
    ["New Bookings (Purchase)",       `=${s("AG")}`,                       "", "Purchase conversions"],
    ["Link Clicks",                  `=${s("AC")}`,                       "", ""],
    ["Impressions",                  `=${s("AA")}`,                       "", ""],
    ["","","",""],
    ["CAC — New Booking",            `=IFERROR(B${r}/B${r+1},"—")`,       "", "Cost per Purchase"],
    ["CPC",                          `=IFERROR(B${r}/B${r+2},"—")`,       "", "Cost per click"],
    ["CPM",                          `=IFERROR(B${r}/B${r+3}*1000,"—")`,  "", "Per 1k impressions"],
  ]
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔧  Platform Data Fix + Pivot Rebuild\n")

  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  const SRC = tabMap["Platform Data"]
  console.log("Tabs:", Object.keys(tabMap).join(", "))

  // ── 1. Load Namer + Lookup ───────────────────────────────────────────────
  console.log("\n📖 Loading Namer...")
  const [namer, lookup] = await Promise.all([loadNamer(), loadLookup()])
  console.log(`   ${namer.camps.length} campaigns | ${namer.adsets.length} ad sets | ${namer.creatives.length} ads`)

  // ── 2. Generate 7 days of fresh data ─────────────────────────────────────
  console.log("\n📊 Generating 7-day data...")
  const allRows = []
  for (let d=6; d>=0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate()-d)
    const iso = dt.toISOString().slice(0,10)
    // sheetRow = header(1) + rows already added + 2 (1-based)
    const sheetRowStart = 2 + allRows.length
    const dayRows = genRows(namer, lookup, iso, sheetRowStart)
    allRows.push(...dayRows)
  }
  console.log(`   ${allRows.length} rows generated (${namer.creatives.length} ads × 7 days)`)

  // ── 3. Write Platform Data (clear + write fresh) ──────────────────────────
  console.log("\n📝 Writing Platform Data...")
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Platform Data!A1:AH2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS,...allRows]}
  })
  console.log("   ✅ Wrote", allRows.length, "rows to Master Report")

  // Format Platform Data
  const pdFmt = [
    frz(SRC,1,0),
    // Dark header
    cFmt(SRC,0,1,0,HEADERS.length,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    // Formula column headers — green
    ...FORMULA_COLS.map(c=>cFmt(SRC,0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}})),
    // Formula column data — light green
    ...FORMULA_COLS.map(c=>cFmt(SRC,1,2000,c,c+1,{backgroundColor:C.fmlHL})),
    // Date format
    cFmt(SRC,1,2000,0,1,DATE),
    // Spend = USD
    cFmt(SRC,1,2000,COL.spend,COL.spend+1,USD),
    // Metrics = INT
    cFmt(SRC,1,2000,COL.imps,HEADERS.length,INT),
    // ID cols (G-L = 6-11) — monospace tint
    cFmt(SRC,1,2000,6,12,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Column widths
    cw(SRC,0,1,100), cw(SRC,1,2,50),  cw(SRC,2,3,50),  cw(SRC,3,4,185), // Date, Year, Month, Week
    cw(SRC,4,5,70),                                                          // Platform
    cw(SRC,5,6,50),                                                          // Phase
    cw(SRC,6,7,75),  cw(SRC,7,8,240),                                       // Campaign ID, Campaign Name
    cw(SRC,8,9,75),  cw(SRC,9,10,255),                                      // Ad Set ID, Ad Set Name
    cw(SRC,10,11,65),cw(SRC,11,12,160),                                     // Ad ID, Ad Name
    cw(SRC,12,13,115),cw(SRC,13,14,105),cw(SRC,14,15,115),                 // Objective, Aud Group, Funnel
    cw(SRC,15,16,155),cw(SRC,16,17,170),cw(SRC,17,18,75),                  // Tactic, Tgt Name, Geo
    cw(SRC,18,19,110),cw(SRC,19,20,80),cw(SRC,20,21,65),                   // Angle, Format, Length
    cw(SRC,21,22,85), cw(SRC,22,23,90),cw(SRC,23,24,195),cw(SRC,24,25,170),// Ratio, CTA, Hook, OptEvent
    cw(SRC,25,34,85),                                                         // Metrics
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:pdFmt}})
  console.log("   ✅ Platform Data formatted")

  // Sync to Finance Tracker
  await sheets.spreadsheets.values.clear({spreadsheetId:FINANCE, range:"Platform Data!A1:AH2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:FINANCE, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS,...allRows]}
  })
  console.log("   ✅ Finance Tracker synced")

  // ── 4. Rebuild Performance Report ────────────────────────────────────────
  console.log("\n📊 Rebuilding Performance Report...")
  const PR = tabMap["Performance Report"]
  const HB=52, GB=142

  const prSecs = [
    {row:3,  label:"▌ OVERALL  ·  By Platform",       t:"overall"},
    {row:12, label:"▌ OVERALL  ·  By Phase",            t:"overall"},
    {row:21, label:"▌ OVERALL  ·  By Funnel Stage",     t:"overall"},
    {row:30, label:"▌ OVERALL  ·  By Audience Group",   t:"overall"},
    {row:HB,   label:"⬛  HOST PERFORMANCE",             t:"host",big:true},
    {row:HB+2, label:"▌ HOST  ·  KPIs & CAC",           t:"host"},
    {row:HB+13,label:"▌ HOST  ·  By Phase",              t:"host"},
    {row:HB+23,label:"▌ HOST  ·  By Funnel Stage",       t:"host"},
    {row:HB+33,label:"▌ HOST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"host"},
    {row:HB+59,label:"▌ HOST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"host"},
    {row:GB,   label:"⬛  GUEST PERFORMANCE",            t:"guest",big:true},
    {row:GB+2, label:"▌ GUEST  ·  KPIs & CAC",          t:"guest"},
    {row:GB+13,label:"▌ GUEST  ·  By Phase",             t:"guest"},
    {row:GB+23,label:"▌ GUEST  ·  By Funnel Stage",      t:"guest"},
    {row:GB+33,label:"▌ GUEST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"guest"},
    {row:GB+59,label:"▌ GUEST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"guest"},
  ]
  const prLabels = labelRows("thrml — Performance Report", prSecs.map(s=>({row:s.row,label:s.label})), GB+90)
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Performance Report!A1:Z600"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:prLabels}})

  // KPI tables
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`Performance Report!A${HB+3+1}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:kpiRows("Host",HB+4)}})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`Performance Report!A${GB+3+1}`,
    valueInputOption:"USER_ENTERED",requestBody:{values:kpiRows("Guest",GB+4)}})

  const prPivots = [
    pivot(PR,SRC,4,  [COL.platform], ALL_MET),
    pivot(PR,SRC,13, [COL.phase],    ALL_MET),
    pivot(PR,SRC,22, [COL.funnel],   ALL_MET),
    pivot(PR,SRC,31, [COL.audGroup], ALL_MET),
    pivot(PR,SRC,HB+14,[COL.phase],  HST_MET,[hostF]),
    pivot(PR,SRC,HB+24,[COL.funnel], HST_MET,[hostF]),
    pivot(PR,SRC,HB+34,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,prospF]),
    pivot(PR,SRC,HB+60,[COL.tgtTactic,COL.tgtName],HST_MET,[hostF,rtF]),
    pivot(PR,SRC,GB+14,[COL.phase],  GST_MET,[guestF]),
    pivot(PR,SRC,GB+24,[COL.funnel], GST_MET,[guestF]),
    pivot(PR,SRC,GB+34,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,prospF]),
    pivot(PR,SRC,GB+60,[COL.tgtTactic,COL.tgtName],GST_MET,[guestF,rtF]),
  ]

  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...prPivots,
    ...secFmts(PR,9,prSecs),
    ...numFmtReqs(PR),
    cFmt(PR,HB+3,HB+12,1,2,USD), cFmt(PR,HB+8,HB+12,1,2,{...USD,textFormat:{bold:true}}),
    cFmt(PR,GB+3,GB+12,1,2,USD), cFmt(PR,GB+8,GB+12,1,2,{...USD,textFormat:{bold:true}}),
    cw(PR,0,1,255),cw(PR,1,2,105),cw(PR,2,3,115),cw(PR,3,4,105),
    cw(PR,4,5,140),cw(PR,5,6,155),cw(PR,6,7,120),cw(PR,7,8,90),cw(PR,8,9,130),
  ]}})
  console.log("   ✅ Performance Report: 12 pivots + KPI tables")

  // ── 5. Rebuild creative tabs ──────────────────────────────────────────────
  console.log("\n📊 Rebuilding creative tabs...")
  const crSecs = [
    {row:3,  col:COL.angle,   label:"▌ BY ANGLE"},
    {row:17, col:COL.fmtType, label:"▌ BY FORMAT TYPE"},
    {row:28, col:COL.length,  label:"▌ BY LENGTH"},
    {row:39, col:COL.ratio,   label:"▌ BY ASPECT RATIO"},
    {row:50, col:COL.cta,     label:"▌ BY CTA"},
    {row:62, col:COL.tgtName, label:"▌ BY TARGETING NAME"},
  ]
  for (const [tabTitle, filt, met, t] of [
    ["Host Creative",  hostF,  HST_MET, "host"],
    ["Guest Creative", guestF, GST_MET, "guest"],
  ]) {
    const sid = tabMap[tabTitle]; if(!sid){console.log(`  ⚠️ '${tabTitle}' not found`);continue}
    const crLabels = labelRows(`thrml — ${tabTitle}`,crSecs.map(s=>({row:s.row,label:s.label})),100)
    await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:`'${tabTitle}'!A1:Z300`})
    await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:`'${tabTitle}'!A1`,
      valueInputOption:"USER_ENTERED",requestBody:{values:crLabels}})
    const bg = t==="host"?C.hostBg:C.gstBg
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      ...crSecs.map(s=>pivot(sid,SRC,s.row+1,[s.col],met,[filt])),
      frz(sid,3,1),
      cFmt(sid,0,1,0,9,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cFmt(sid,1,2,0,9,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cFmt(sid,2,3,0,9,{backgroundColor:C.navy}),
      rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
      ...crSecs.map(s=>cFmt(sid,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
      ...crSecs.map(s=>rh(sid,s.row,s.row+1,28)),
      ...numFmtReqs(sid),
      cw(sid,0,1,190),cw(sid,1,2,105),cw(sid,2,3,115),cw(sid,3,4,105),
      cw(sid,4,5,140),cw(sid,5,6,155),cw(sid,6,7,120),cw(sid,7,8,90),cw(sid,8,9,130),
    ]}})
    console.log(`   ✅ ${tabTitle}: 6 pivots`)
  }

  // ── 6. Rebuild Spend Breakdown ────────────────────────────────────────────
  console.log("\n📊 Rebuilding Spend Breakdown...")
  const SB = tabMap["Spend Breakdown"]
  const sbSecs = [
    {row:3,  col:COL.platform, label:"▌ BY PLATFORM"},
    {row:13, col:COL.phase,    label:"▌ BY PHASE"},
    {row:23, col:COL.month,    label:"▌ BY MONTH"},
    {row:33, col:COL.week,     label:"▌ BY WEEK"},
    {row:43, col:COL.geo,      label:"▌ BY GEO"},
    {row:52, col:COL.date,     label:"▌ BY DATE"},
  ]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({spreadsheetId:MASTER,range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:labelRows("thrml — Spend Breakdown",sbSecs.map(s=>({row:s.row,label:s.label})),100)}})
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
    ...sbSecs.map(s=>pivot(SB,SRC,s.row+1,[s.col],SPD_MET)),
    frz(SB,3,1),
    cFmt(SB,0,1,0,4,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(SB,1,2,0,4,{backgroundColor:C.navy,textFormat:{foregroundColor:C.accent,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(SB,2,3,0,4,{backgroundColor:C.navy}),
    rh(SB,0,1,48),rh(SB,1,2,22),rh(SB,2,3,8),
    ...sbSecs.map(s=>cFmt(SB,s.row,s.row+1,0,4,{backgroundColor:C.secBg,textFormat:{foregroundColor:C.white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
    ...sbSecs.map(s=>rh(SB,s.row,s.row+1,28)),
    ...numFmtReqs(SB),
    cw(SB,0,1,210),cw(SB,1,2,115),cw(SB,2,3,120),cw(SB,3,4,110),
  ]}})
  console.log("   ✅ Spend Breakdown: 6 pivots")

  // Final verification
  const check = await sheets.spreadsheets.values.get({spreadsheetId:MASTER,
    range:"Platform Data!A1:AH3",valueRenderOption:"FORMATTED_VALUE"})
  const chkRows = check.data.values??[]
  console.log("\n✅ Platform Data verification:")
  console.log("  Headers:", chkRows[0]?.slice(0,8).join(" | ")+"...")
  console.log("  Row 2:  ", chkRows[1]?.slice(0,8).join(" | ")+"...")
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER}\n`)
}

main().catch(e=>{console.error("❌",e.message);process.exit(1)})
