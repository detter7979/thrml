/**
 * thrml — Rebuild Platform Data with Namer Lookups
 *
 * ARCHITECTURE:
 *   Hard columns (from platform export):
 *     Date, Platform, Campaign ID, Ad Set ID, Ad ID + all metrics
 *
 *   Formula columns (VLOOKUP from Reference Table tab):
 *     Year, Month, Week                  ← date formulas
 *     Campaign Name, Phase, Objective,   ← from Campaign Lookup (Campaign ID key)
 *     Audience Group, Funnel Stage, Geo,
 *     Opt. Event
 *     Ad Set Name, Space Type,           ← from Ad Set Lookup (Ad Set ID key)
 *     Targeting Tactic, Placement
 *     Ad Name, Angle, Format Type,       ← from Ad Lookup (Ad ID key)
 *     Length, Aspect Ratio, CTA, Hook
 *     Targeting Name                     ← from Targeting Lookup (Space Type key)
 *
 * If you update any field in the Namer, the Reference Table tab updates
 * on next run, and all formulas in Platform Data instantly reflect it.
 *
 * Run: node scripts/rebuild-platform-data.mjs
 */

import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth  = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
})
const sheets = google.sheets({ version: "v4", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER   = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// ─────────────────────────────────────────────────────────────────────────────
// DEFINITIVE COLUMN LAYOUT
// Hard = value written directly; Formula = VLOOKUP/formula driven
// ─────────────────────────────────────────────────────────────────────────────
const HEADERS = [
  // ── Time ──────────────────────────────────────────
  "Date",               // A  0  HARD
  "Year",               // B  1  FORMULA =YEAR(A)
  "Month",              // C  2  FORMULA =TEXT(A,"Mmm")
  "Week",               // D  3  FORMULA =CONCATENATE(...)
  // ── Identity ──────────────────────────────────────
  "Platform",           // E  4  HARD
  "Campaign ID",        // F  5  HARD
  "Ad Set ID",          // G  6  HARD
  "Ad ID",              // H  7  HARD
  // ── Campaign dims (VLOOKUP from Campaign Lookup) ──
  "Campaign Name",      // I  8  FORMULA
  "Phase",              // J  9  FORMULA
  "Campaign Objective", // K  10 FORMULA
  "Audience Group",     // L  11 FORMULA
  "Funnel Stage",       // M  12 FORMULA
  "Geo",                // N  13 FORMULA
  "Opt. Event",         // O  14 FORMULA
  // ── Ad Set dims (VLOOKUP from Ad Set Lookup) ──────
  "Ad Set Name",        // P  15 FORMULA
  "Space Type",         // Q  16 FORMULA
  "Targeting Tactic",   // R  17 FORMULA
  "Placement",          // S  18 FORMULA
  // ── Ad dims (VLOOKUP from Ad Lookup) ─────────────
  "Ad Name",            // T  19 FORMULA
  "Angle",              // U  20 FORMULA
  "Format Type",        // V  21 FORMULA
  "Length",             // W  22 FORMULA
  "Aspect Ratio",       // X  23 FORMULA
  "CTA",                // Y  24 FORMULA
  "Hook Copy",          // Z  25 FORMULA
  // ── Targeting Name (VLOOKUP from Targeting Lookup)
  "Targeting Name",     // AA 26 FORMULA
  // ── Metrics (HARD) ────────────────────────────────
  "Spend ($)",          // AB 27 HARD
  "Impressions",        // AC 28 HARD
  "Reach",              // AD 29 HARD
  "Link Clicks",        // AE 30 HARD
  "become_host_click",  // AF 31 HARD
  "host_onboarding_started", // AG 32 HARD
  "listing_created",    // AH 33 HARD
  "Purchase",           // AE 34 HARD
  "Video Views 100%",   // AF 35 HARD
]

// Column indices
const C = {
  date:0,year:1,month:2,week:3,platform:4,
  campId:5,asId:6,adId:7,
  campName:8,phase:9,campObj:10,audGroup:11,funnel:12,geo:13,optEvent:14,
  asName:15,spaceType:16,tgtTactic:17,placement:18,
  adName:19,angle:20,fmtType:21,length:22,ratio:23,cta:24,hook:25,
  tgtName:26,
  spend:27,imps:28,reach:29,clicks:30,bhc:31,hos:32,lc:33,pur:34,vv100:35,
}

// Formula column indices — highlighted green in sheet
const FORMULA_COLS = [1,2,3, 8,9,10,11,12,13,14, 15,16,17,18, 19,20,21,22,23,24,25, 26]

// Column letter from 0-based index
const L = (n) => n < 26 ? String.fromCharCode(65+n) : `A${String.fromCharCode(65+n-26)}`

// ─────────────────────────────────────────────────────────────────────────────
// Reference Table column layout
// Tab: "Reference Table"
// Three sections stacked vertically (separated by blank rows):
//   1. Campaign Lookup  (cols A-H)
//   2. Ad Set Lookup    (cols A-G)
//   3. Ad Lookup        (cols A-J)
// ─────────────────────────────────────────────────────────────────────────────

// We'll write them to three separate named ranges for clarity:
// Campaign Lookup: rows 1+
// Ad Set Lookup: starts after last campaign row + 2 blank rows
// Ad Lookup: starts after last adset row + 2 blank rows

const CAMP_HDR  = ["Campaign ID","Campaign Name","Phase","Campaign Objective","Funnel Stage","Audience Group","Geo","Opt. Event"]
const ADSET_HDR = ["Ad Set ID","Ad Set Name","Campaign ID","Space Type","Targeting Tactic","Placement","Audience Details"]
const AD_HDR    = ["Ad ID","Ad Name","Ad Set ID","Campaign ID","Angle","Format Type","Length","Aspect Ratio","CTA","Hook Copy"]
const TGT_HDR   = ["Space Type (Raw)","Targeting Name (Display)","Notes"]

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const CLR = {
  ink:    {red:0.047,green:0.086,blue:0.157},
  navy:   {red:0.078,green:0.133,blue:0.216},
  white:  {red:1,green:1,blue:1},
  fmlHdr: {red:0.200,green:0.600,blue:0.120},
  fmlDat: {red:0.878,green:0.957,blue:0.820},
  idBg:   {red:0.941,green:0.918,blue:0.988},
  USD:    {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}},
  INT:    {numberFormat:{type:"NUMBER",  pattern:"#,##0"}},
  DATE:   {numberFormat:{type:"DATE",    pattern:"yyyy-mm-dd"}},
}

const rng  = (s,r1,r2,c1,c2) => ({sheetId:s,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
const cFmt = (s,r1,r2,c1,c2,f) => ({repeatCell:{range:rng(s,r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
const cw   = (s,a,b,px) => ({updateDimensionProperties:{range:{sheetId:s,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
const frz  = (s,r,c=0)  => ({updateSheetProperties:{properties:{sheetId:s,gridProperties:{frozenRowCount:r,frozenColumnCount:c}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})

// Week formula (ISO week, Mon-Sun)
const weekFml = (row) =>
  `=CONCATENATE("Week ",ISOWEEKNUM(A${row}),` +
  `" (",TEXT(A${row}-WEEKDAY(A${row},2)+1,"MM/DD"),` +
  `" - ",TEXT(A${row}-WEEKDAY(A${row},2)+7,"MM/DD/YY"),")")`

// VLOOKUP formula helpers
// Campaign Lookup is on sheet "Reference Table", camp data starts at row RT_CAMP_START
// We'll use named range offsets after we know the layout
// For now, build formulas that reference the Reference Table tab by name

// Campaign lookup: key=Campaign ID (col F = col 5), ref tab col layout: A=campId, B=name, C=phase, D=obj, E=funnel, F=audGrp, G=geo, H=optEvt
const campLkp = (row, retCol) => // retCol: 2=name,3=phase,4=obj,5=funnel,6=audGrp,7=geo,8=optEvt
  `=IFERROR(VLOOKUP(F${row},'Reference Table'!$A:$H,${retCol},FALSE),"")`

// Ad Set lookup: key=Ad Set ID (col G = col 6), ref: A=asId, B=asName, C=campId, D=spaceType, E=tactic, F=placement, G=details
const asLkp = (row, retCol) => // retCol: 2=asName,4=spaceType,5=tactic,6=placement
  `=IFERROR(VLOOKUP(G${row},'Reference Table'!$J:$P,${retCol},FALSE),"")`

// Ad lookup: key=Ad ID (col H = col 7), ref: A=adId, B=adName, C=asId, D=campId, E=angle, F=fmt, G=len, H=ratio, I=cta, J=hook
const adLkp = (row, retCol) => // retCol: 2=adName,5=angle,6=fmt,7=len,8=ratio,9=cta,10=hook
  `=IFERROR(VLOOKUP(H${row},'Reference Table'!$R:$AA,${retCol},FALSE),"")`

// Targeting Name lookup: key=Space Type (col Q = col 16)
const tgtLkp = (row) =>
  `=IFERROR(VLOOKUP(Q${row},'Targeting Lookup'!$A:$B,2,FALSE),Q${row})`

async function main() {
  console.log("\n🔄  Rebuild Platform Data — Namer-driven lookups\n")

  // ── 1. Get tab map ─────────────────────────────────────────────────────
  const meta = await sheets.spreadsheets.get({spreadsheetId:MASTER})
  const tabMap = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title,s.properties.sheetId]))
  console.log("Existing tabs:", Object.keys(tabMap).join(", "))

  // ── 2. Load Namer data ─────────────────────────────────────────────────
  console.log("\n📖 Loading Namer...")
  const [cbR,asR,crR] = await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Campaign Builder!A2:L20", valueRenderOption:"UNFORMATTED_VALUE"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Ad Set Builder!A2:J30",  valueRenderOption:"UNFORMATTED_VALUE"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER, range:"Creative Builder!A2:Q25",valueRenderOption:"UNFORMATTED_VALUE"}),
  ])

  // Campaign Builder cols: [0]CampID [1]Platform [2]Phase [3]Funnel [4]Objective [5]Goal [6]AudType [7]Geo [8]CampName [9]Event
  const camps     = (cbR.data.values??[]).filter(r=>r[0])
  // Ad Set Builder cols: [0]AsID [1]CampID [2]CampName [3]SpaceType [4]AudSrc [5]Placement [6]Details [7]AdSetName [8]ConvEvent
  const adsets    = (asR.data.values??[]).filter(r=>r[0])
  // Creative Builder cols: [0]AdID [1]AsID [2]CampID [3]Concept [4]Format [5]Length [6]Size [7]Variant [8]CTA [9]AdSetName [10]AdName [11]Hook
  const creatives = (crR.data.values??[]).filter(r=>r[0])

  console.log(`   Campaigns: ${camps.length} | Ad Sets: ${adsets.length} | Ads: ${creatives.length}`)

  // Map IDs for quick lookup
  const campMap  = Object.fromEntries(camps.map(r=>[r[0],r]))
  const adsetMap = Object.fromEntries(adsets.map(r=>[r[0],r]))
  const adMap    = Object.fromEntries(creatives.map(r=>[r[0],r]))

  // Audience type → display
  const AUD_DISP = {host:"Host", guest:"Guest"}
  const FUNNEL_DISP = {PROSP:"Prospecting",LAL:"Lookalike",LAL1:"Lookalike",LAL2:"Lookalike",RT:"Retargeting",CRM:"CRM"}
  const OBJ_DISP = {REACH:"Reach",LEAD:"Lead",CONV:"Conversion",AWARE:"Awareness"}
  const GEO_DISP = {SEA:"Seattle",ALL:"All",US:"US"}
  const PLAT_DISP = {META:"Meta",GOOG:"Google",SNAP:"Snapchat",TIKTOK:"TikTok"}
  const TACTIC_MAP = {
    int:"Interest",lal1:"LAL 1%",lal2:"LAL 2%",lal:"LAL",
    rt_checkout:"Retargeting - Checkout",rt_listing:"Retargeting - Listing",crmatch:"CRM Match"
  }

  const tc = s => !s ? "" : s.replace(/_/g," ").replace(/\w+/g,w=>{
    const up=w.toUpperCase()
    return ["UGC","LAL","RSA","CRM","CTA","ROAS","CAC","CPM","CPC"].includes(up)?up:w[0].toUpperCase()+w.slice(1).toLowerCase()
  })

  // ── 3. Build Reference Table data ──────────────────────────────────────
  // Campaign rows — CAMP_HDR = [CampID,CampName,Phase,Objective,Funnel,AudGroup,Geo,OptEvent]
  const campRows = camps.map(r => [
    r[0],                                           // Campaign ID
    r[8] ?? r[0],                                   // Campaign Name
    r[2] ?? "",                                     // Phase
    OBJ_DISP[r[4]?.toUpperCase()] ?? tc(r[4]),     // Campaign Objective
    FUNNEL_DISP[r[3]?.toUpperCase()] ?? tc(r[3]),  // Funnel Stage
    AUD_DISP[r[6]?.toLowerCase()] ?? tc(r[6]),     // Audience Group
    GEO_DISP[r[7]?.toUpperCase()] ?? tc(r[7]),     // Geo
    r[9] ?? "",                                     // Opt. Event
  ])

  // Ad Set rows — ADSET_HDR = [AsID,AsName,CampID,SpaceType,TgtTactic,Placement,Details]
  const adsetRows = adsets.map(r => [
    r[0],                                           // Ad Set ID
    r[7] ?? r[0],                                   // Ad Set Name
    r[1] ?? "",                                     // Campaign ID (parent)
    tc(r[3]),                                       // Space Type
    TACTIC_MAP[r[4]?.toLowerCase()] ?? tc(r[4]),   // Targeting Tactic
    tc(r[5]),                                       // Placement
    r[6] ?? "",                                     // Audience Details
  ])

  // Ad rows — AD_HDR = [AdID,AdName,AsID,CampID,Angle,FmtType,Length,Ratio,CTA,Hook]
  const adRows = creatives.map(r => [
    r[0],                                           // Ad ID
    r[10] ?? r[0],                                  // Ad Name
    r[1] ?? "",                                     // Ad Set ID (parent)
    r[2] ?? "",                                     // Campaign ID (parent)
    tc(r[3]),                                       // Angle / Concept
    tc(r[4]),                                       // Format Type
    r[5] ?? "NA",                                   // Length
    r[6] ?? "NA",                                   // Aspect Ratio
    tc(r[8]?.replace(/_/g," ")),                    // CTA
    r[11] ?? "",                                    // Hook Copy
  ])

  // ── 4. Ensure Reference Table tab ──────────────────────────────────────
  if (!tabMap["Reference Table"]) {
    const r = await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[
      {addSheet:{properties:{title:"Reference Table"}}}
    ]}})
    tabMap["Reference Table"] = r.data.replies[0].addSheet.properties.sheetId
    console.log("✅ Created 'Reference Table' tab")
  }
  const RT_SID = tabMap["Reference Table"]

  // Layout (0-based rows):
  // Row 0: Campaign header
  // Row 1..campRows.length: campaign data
  // Row campRows.length+1: blank
  // Row campRows.length+2: Ad Set header  (= RT_AS_START)
  // ...
  const RT_CAMP_ROW  = 0                            // campaign header row (0-based)
  const RT_AS_ROW    = campRows.length + 2          // adset header row
  const RT_AD_ROW    = RT_AS_ROW + adsetRows.length + 2  // ad header row

  // Write Reference Table (three sections, cols A-J each, stacked vertically)
  // Pad shorter rows with empty strings
  const pad = (row, len) => [...row, ...Array(Math.max(0,len-row.length)).fill("")]

  // Max width across all sections = 10 (Ad Lookup)
  const RT_WIDTH = AD_HDR.length  // 10

  const rtRows = [
    // Campaign section (cols A-H)
    pad(CAMP_HDR, RT_WIDTH),
    ...campRows.map(r=>pad(r, RT_WIDTH)),
    Array(RT_WIDTH).fill(""),
    // Ad Set section (cols A-G) — starts at RT_AS_ROW (0-based)
    pad(ADSET_HDR, RT_WIDTH),
    ...adsetRows.map(r=>pad(r, RT_WIDTH)),
    Array(RT_WIDTH).fill(""),
    // Ad section (cols A-J) — starts at RT_AD_ROW (0-based)
    pad(AD_HDR, RT_WIDTH),
    ...adRows.map(r=>pad(r, RT_WIDTH)),
  ]

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Reference Table!A1:J500"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Reference Table!A1",
    valueInputOption:"USER_ENTERED", requestBody:{values:rtRows}
  })
  console.log(`✅ Reference Table: ${campRows.length} campaigns / ${adsetRows.length} ad sets / ${adRows.length} ads`)

  // Format Reference Table
  const rtFmt = [
    frz(RT_SID,1,1),
    // Section headers bold+dark
    ...[RT_CAMP_ROW, RT_AS_ROW, RT_AD_ROW].map(r=>
      cFmt(RT_SID,r,r+1,0,RT_WIDTH,{backgroundColor:CLR.ink,textFormat:{foregroundColor:CLR.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:5,bottom:5}})
    ),
    // ID cols monospace
    cFmt(RT_SID,0,500,0,1,{textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Column widths
    cw(RT_SID,0,1,80),cw(RT_SID,1,2,270),cw(RT_SID,2,3,80),cw(RT_SID,3,4,110),
    cw(RT_SID,4,5,115),cw(RT_SID,5,6,100),cw(RT_SID,6,7,75),cw(RT_SID,7,8,170),
    cw(RT_SID,8,9,80),cw(RT_SID,9,10,170),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER, requestBody:{requests:rtFmt}})

  // ── 5. Load existing Platform Data (raw/hard values only) ─────────────
  console.log("\n📊 Reading existing Platform Data...")
  const pdRaw = await sheets.spreadsheets.values.get({
    spreadsheetId:MASTER, range:"Platform Data!A1:AG2000",
    valueRenderOption:"UNFORMATTED_VALUE"
  })
  const pdRows = pdRaw.data.values ?? []
  const oldHdrs = pdRows[0] ?? []
  const oldIdx  = Object.fromEntries(oldHdrs.map((h,i)=>[h,i]))
  const dataRows = pdRows.slice(1).filter(r=>r.some(c=>c!==undefined&&c!==""))
  console.log(`   Existing rows: ${dataRows.length} | Headers: ${oldHdrs.slice(0,8).join("|")}`)

  // Extract hard values from each row using old header map
  // Priority order for finding each hard col:
  const getHard = (row, ...names) => {
    for (const n of names) {
      const i = oldIdx[n]
      if (i !== undefined && row[i] !== undefined && row[i] !== "") return row[i]
    }
    return ""
  }

  // Build new rows: hard values first, formulas as strings
  const outRows = dataRows.map((oldRow, idx) => {
    const sheetRow = idx + 2  // 1-based, header is row 1

    const date     = getHard(oldRow, "Date")
    const platform = getHard(oldRow, "Platform")
    const campId   = getHard(oldRow, "Campaign ID")
    const asId     = getHard(oldRow, "Ad Set ID")
    const adId     = getHard(oldRow, "Ad ID")
    const spend    = getHard(oldRow, "Spend ($)")
    const imps     = getHard(oldRow, "Impressions")
    const reach    = getHard(oldRow, "Reach")
    const clicks   = getHard(oldRow, "Link Clicks")
    const bhc      = getHard(oldRow, "become_host_click")
    const hos      = getHard(oldRow, "host_onboarding_started")
    const lc       = getHard(oldRow, "listing_created")
    const pur      = getHard(oldRow, "Purchase")
    const vv100    = getHard(oldRow, "Video Views 100%")

    // Campaign lookup — uses Reference Table rows RT_CAMP_ROW+1 to RT_CAMP_ROW+campRows.length+1
    // Sheet rows (1-based): header at RT_CAMP_ROW+1, data at RT_CAMP_ROW+2 ..
    const campLookup = (retCol) =>
      `=IFERROR(VLOOKUP(F${sheetRow},'Reference Table'!$A$${RT_CAMP_ROW+2}:$H$${RT_CAMP_ROW+1+campRows.length+1},${retCol},FALSE),"")`
    // Ad Set lookup — starts at RT_AS_ROW+2 (1-based)
    const asLookup = (retCol) =>
      `=IFERROR(VLOOKUP(G${sheetRow},'Reference Table'!$A$${RT_AS_ROW+2}:$G$${RT_AS_ROW+1+adsetRows.length+1},${retCol},FALSE),"")`
    // Ad lookup — starts at RT_AD_ROW+2 (1-based)
    const adLookup = (retCol) =>
      `=IFERROR(VLOOKUP(H${sheetRow},'Reference Table'!$A$${RT_AD_ROW+2}:$J$${RT_AD_ROW+1+adRows.length+1},${retCol},FALSE),"")`
    // Targeting Name — from Targeting Lookup, key = Space Type (col Q = index 16)
    const tgtLookup = `=IFERROR(VLOOKUP(Q${sheetRow},'Targeting Lookup'!$A:$B,2,FALSE),Q${sheetRow})`

    return [
      // Hard: time + IDs
      date,                               // A 0  Date
      `=IF(A${sheetRow}="","",YEAR(A${sheetRow}))`,   // B 1  Year
      `=IF(A${sheetRow}="","",TEXT(A${sheetRow},"Mmm"))`, // C 2  Month
      `=IF(A${sheetRow}="","",${weekFml(sheetRow).slice(1)})`, // D 3  Week
      platform,                           // E 4  Platform
      campId,                             // F 5  Campaign ID
      asId,                               // G 6  Ad Set ID
      adId,                               // H 7  Ad ID
      // Campaign dimension lookups
      campLookup(2),                      // I  8  Campaign Name
      campLookup(3),                      // J  9  Phase
      campLookup(4),                      // K  10 Campaign Objective
      campLookup(6),                      // L  11 Audience Group
      campLookup(5),                      // M  12 Funnel Stage
      campLookup(7),                      // N  13 Geo
      campLookup(8),                      // O  14 Opt. Event
      // Ad Set dimension lookups
      asLookup(2),                        // P  15 Ad Set Name
      asLookup(4),                        // Q  16 Space Type
      asLookup(5),                        // R  17 Targeting Tactic
      asLookup(6),                        // S  18 Placement
      // Ad dimension lookups
      adLookup(2),                        // T  19 Ad Name
      adLookup(5),                        // U  20 Angle
      adLookup(6),                        // V  21 Format Type
      adLookup(7),                        // W  22 Length
      adLookup(8),                        // X  23 Aspect Ratio
      adLookup(9),                        // Y  24 CTA
      adLookup(10),                       // Z  25 Hook Copy
      // Targeting Name from Targeting Lookup
      tgtLookup,                          // AA 26 Targeting Name
      // Hard: metrics
      spend,                              // AB 27
      imps,                               // AC 28
      reach,                              // AD 29
      clicks,                             // AE 30
      bhc,                                // AF 31
      hos,                                // AG 32
      lc,                                 // AH 33
      pur,                                // AI 34
      vv100,                              // AJ 35
    ]
  })

  // ── 6. Write Platform Data ──────────────────────────────────────────────
  const PD_SID = tabMap["Platform Data"]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Platform Data!A1:AJ2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS, ...outRows]}
  })
  console.log(`✅ Platform Data: ${outRows.length} rows, ${HEADERS.length} cols`)
  console.log(`   Formula cols: Year,Month,Week + 19 VLOOKUP cols`)

  // ── 7. Format Platform Data ─────────────────────────────────────────────
  const pdFmt = [
    frz(PD_SID,1,0),
    // Header: all dark
    cFmt(PD_SID,0,1,0,HEADERS.length,{
      backgroundColor:CLR.ink,
      textFormat:{foregroundColor:CLR.white,bold:true,fontSize:10},
      verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}
    }),
    // Formula column headers: bright green
    ...FORMULA_COLS.map(ci=>cFmt(PD_SID,0,1,ci,ci+1,{
      backgroundColor:CLR.fmlHdr,
      textFormat:{foregroundColor:CLR.white,bold:true,fontSize:10}
    })),
    // Formula column data: light green tint
    ...FORMULA_COLS.map(ci=>cFmt(PD_SID,1,2000,ci,ci+1,{backgroundColor:CLR.fmlDat})),
    // Hard ID columns: purple tint monospace
    cFmt(PD_SID,1,2000,4,8,{backgroundColor:CLR.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Date format
    cFmt(PD_SID,1,2000,0,1,CLR.DATE),
    // Spend = USD
    cFmt(PD_SID,1,2000,C.spend,C.spend+1,CLR.USD),
    // Integer metrics
    cFmt(PD_SID,1,2000,C.imps,HEADERS.length,CLR.INT),
    // Column widths
    cw(PD_SID,0,1,100),   // Date
    cw(PD_SID,1,2,52),    // Year
    cw(PD_SID,2,3,52),    // Month
    cw(PD_SID,3,4,185),   // Week
    cw(PD_SID,4,5,72),    // Platform
    cw(PD_SID,5,6,78),    // Campaign ID
    cw(PD_SID,6,7,78),    // Ad Set ID
    cw(PD_SID,7,8,68),    // Ad ID
    cw(PD_SID,8,9,245),   // Campaign Name
    cw(PD_SID,9,10,52),   // Phase
    cw(PD_SID,10,11,115), // Campaign Objective
    cw(PD_SID,11,12,100), // Audience Group
    cw(PD_SID,12,13,115), // Funnel Stage
    cw(PD_SID,13,14,75),  // Geo
    cw(PD_SID,14,15,170), // Opt. Event
    cw(PD_SID,15,16,260), // Ad Set Name
    cw(PD_SID,16,17,90),  // Space Type
    cw(PD_SID,17,18,155), // Targeting Tactic
    cw(PD_SID,18,19,130), // Placement
    cw(PD_SID,19,20,165), // Ad Name
    cw(PD_SID,20,21,110), // Angle
    cw(PD_SID,21,22,80),  // Format Type
    cw(PD_SID,22,23,65),  // Length
    cw(PD_SID,23,24,85),  // Aspect Ratio
    cw(PD_SID,24,25,90),  // CTA
    cw(PD_SID,25,26,195), // Hook Copy
    cw(PD_SID,26,27,175), // Targeting Name
    cw(PD_SID,27,36,88),  // Metrics
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER, requestBody:{requests:pdFmt}})
  console.log("✅ Platform Data formatted")

  // ── 8. Sync hard values to Finance Tracker (no formulas — VLOOKUP refs won't resolve cross-sheet) ──
  // Write Finance Tracker with resolved values from Namer maps instead of formulas
  const buildHardRow = (oldRow, campId, asId, adId) => {
    const camp  = campMap[campId]  ?? []
    const as_   = adsetMap[asId]   ?? []
    const ad    = adMap[adId]      ?? []
    const date  = getHard(oldRow,"Date")
    const plat  = getHard(oldRow,"Platform")
    return [
      date,
      date ? new Date(date).getFullYear() : "",
      date ? new Date(date).toLocaleString("en-US",{month:"short"}) : "",
      "", // week — leave blank in Finance Tracker (no formula there)
      plat,
      campId,
      asId,
      adId,
      camp[8]??campId,
      OBJ_DISP[camp[4]?.toUpperCase()]??camp[4]??"",
      FUNNEL_DISP[camp[3]?.toUpperCase()]??camp[3]??"",
      AUD_DISP[camp[6]?.toLowerCase()]??camp[6]??"",
      GEO_DISP[camp[7]?.toUpperCase()]??camp[7]??"",
      camp[9]??"",
      as_[7]??asId,
      tc(as_[3]),
      TACTIC_MAP[as_[4]?.toLowerCase()]??tc(as_[4]),
      tc(as_[5]),
      ad[10]??adId,
      tc(ad[3]),
      tc(ad[4]),
      ad[5]??"NA",
      ad[6]??"NA",
      tc(ad[8]?.replace(/_/g," ")),
      ad[11]??"",
      "", // Targeting Name — Finance Tracker doesn't need formula
      getHard(oldRow,"Spend ($)"),
      getHard(oldRow,"Impressions"),
      getHard(oldRow,"Reach"),
      getHard(oldRow,"Link Clicks"),
      getHard(oldRow,"become_host_click"),
      getHard(oldRow,"host_onboarding_started"),
      getHard(oldRow,"listing_created"),
      getHard(oldRow,"Purchase"),
      getHard(oldRow,"Video Views 100%"),
    ]
  }

  const financeRows = dataRows.map(oldRow => {
    const campId = getHard(oldRow,"Campaign ID")
    const asId   = getHard(oldRow,"Ad Set ID")
    const adId   = getHard(oldRow,"Ad ID")
    return buildHardRow(oldRow, campId, asId, adId)
  })

  await sheets.spreadsheets.values.clear({spreadsheetId:FINANCE, range:"Platform Data!A1:AJ2000"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:FINANCE, range:"Platform Data!A1",
    valueInputOption:"USER_ENTERED",
    requestBody:{values:[HEADERS,...financeRows]}
  })
  console.log("✅ Finance Tracker Platform Data synced (resolved values)")

  // ── 9. Rebuild pivot source reference (update REPORT_ID variable in generate script) ──
  // Verify column alignment by spot-checking
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId:MASTER, range:"Platform Data!A1:AJ3",
    valueRenderOption:"FORMATTED_VALUE"
  })
  const hdrs = check.data.values?.[0] ?? []
  const row2 = check.data.values?.[1] ?? []
  console.log("\n📋 Column alignment check (row 2):")
  hdrs.slice(0,20).forEach((h,i)=>console.log(`  [${i}] ${h}: ${String(row2[i]??"")}`.padEnd(55)))

  // ── 10. Rebuild all pivot tables with correct COL offsets ──────────────
  console.log("\n🔄 Rebuilding pivot tables with correct column offsets...")
  await rebuildAllPivots(tabMap, PD_SID)

  console.log(`\n📊 Master Report: https://docs.google.com/spreadsheets/d/${MASTER}`)
  console.log("💡 To refresh: update Namer, then re-run this script to sync Reference Table,")
  console.log("   then all VLOOKUP formulas in Platform Data update automatically.\n")
}

// ── Pivot rebuild ─────────────────────────────────────────────────────────
async function rebuildAllPivots(tabMap, SRC) {
  const USD = {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}}
  const INT = {numberFormat:{type:"NUMBER",  pattern:"#,##0"}}

  const rng  = (s,r1,r2,c1,c2)=>({sheetId:s,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2})
  const cFmt = (s,r1,r2,c1,c2,f)=>({repeatCell:{range:rng(s,r1,r2,c1,c2),cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
  const cw   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  const rh   = (s,a,b,px)=>({updateDimensionProperties:{range:{sheetId:s,dimension:"ROWS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  const frz  = (s,r,c=0)=>({updateSheetProperties:{properties:{sheetId:s,gridProperties:{frozenRowCount:r,frozenColumnCount:c}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})

  const CLR2 = {
    ink:   {red:0.047,green:0.086,blue:0.157},
    navy:  {red:0.078,green:0.133,blue:0.216},
    sec:   {red:0.133,green:0.196,blue:0.298},
    host:  {red:0.067,green:0.216,blue:0.176},
    guest: {red:0.200,green:0.118,blue:0.298},
    white: {red:1,green:1,blue:1},
    acc:   {red:0.651,green:0.761,blue:0.894},
  }

  const ALL_MET = [
    {sourceColumnOffset:C.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
    {sourceColumnOffset:C.imps,   summarizeFunction:"SUM",name:"Impressions"},
    {sourceColumnOffset:C.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
    {sourceColumnOffset:C.bhc,    summarizeFunction:"SUM",name:"become_host_click"},
    {sourceColumnOffset:C.hos,    summarizeFunction:"SUM",name:"host_onboarding_started"},
    {sourceColumnOffset:C.lc,     summarizeFunction:"SUM",name:"listing_created"},
    {sourceColumnOffset:C.pur,    summarizeFunction:"SUM",name:"Purchase"},
    {sourceColumnOffset:C.vv100,  summarizeFunction:"SUM",name:"Video Views 100%"},
  ]
  const SPD_MET = [
    {sourceColumnOffset:C.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
    {sourceColumnOffset:C.imps,   summarizeFunction:"SUM",name:"Impressions"},
    {sourceColumnOffset:C.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
  ]
  const HST_MET = [
    {sourceColumnOffset:C.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
    {sourceColumnOffset:C.imps,   summarizeFunction:"SUM",name:"Impressions"},
    {sourceColumnOffset:C.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
    {sourceColumnOffset:C.bhc,    summarizeFunction:"SUM",name:"Host Clicks (P1)"},
    {sourceColumnOffset:C.hos,    summarizeFunction:"SUM",name:"Onboarding (P2)"},
    {sourceColumnOffset:C.lc,     summarizeFunction:"SUM",name:"Listings Created (P3)"},
  ]
  const GST_MET = [
    {sourceColumnOffset:C.spend,  summarizeFunction:"SUM",name:"Spend ($)"},
    {sourceColumnOffset:C.imps,   summarizeFunction:"SUM",name:"Impressions"},
    {sourceColumnOffset:C.clicks, summarizeFunction:"SUM",name:"Link Clicks"},
    {sourceColumnOffset:C.pur,    summarizeFunction:"SUM",name:"New Bookings"},
    {sourceColumnOffset:C.vv100,  summarizeFunction:"SUM",name:"Video Views 100%"},
  ]

  const hostF  = {filterCriteria:{visibleValues:["Host"]},  columnOffsetIndex:C.audGroup}
  const guestF = {filterCriteria:{visibleValues:["Guest"]}, columnOffsetIndex:C.audGroup}
  const prospF = {filterCriteria:{visibleValues:["Prospecting","Lookalike"]}, columnOffsetIndex:C.funnel}
  const rtF    = {filterCriteria:{visibleValues:["Retargeting"]}, columnOffsetIndex:C.funnel}

  const piv = (tSid,row,rowCols,vals,filters=[]) => ({
    updateCells:{
      start:{sheetId:tSid,rowIndex:row,columnIndex:0},
      rows:[{values:[{pivotTable:{
        source:{sheetId:SRC,startRowIndex:0,startColumnIndex:0,endRowIndex:2000,endColumnIndex:HEADERS.length},
        rows:rowCols.map(o=>({sourceColumnOffset:o,showTotals:true,sortOrder:"ASCENDING"})),
        values:vals, filterSpecs:filters,
      }}]}],
      fields:"pivotTable",
    }
  })

  const numFmt = (sid) => [
    cFmt(sid,3,2000,1,2,USD),
    cFmt(sid,3,2000,2,12,INT),
  ]

  const ink=CLR2.ink, white=CLR2.white

  function buildTab(sid,title,sections,pivotRequests,colWidths,numCols) {
    // Write label rows
    const rows = Array.from({length:300},()=>[""])
    rows[0]=[title]
    rows[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
    rows[2]=[""]
    for (const s of sections) rows[s.row]=[s.label]
    let last=rows.length-1; while(last>3&&rows[last][0]==="") last--
    return { labelRows:rows.slice(0,last+3), pivotRequests, colWidths, sections, numCols, sid }
  }

  // ── Performance Report ─────────────────────────────────────────────────
  const PR_SID = tabMap["Performance Report"]
  const HB=52, GB=145

  const prSecs=[
    {row:3,  label:"▌ OVERALL  ·  By Platform",           t:"overall"},
    {row:12, label:"▌ OVERALL  ·  By Phase",               t:"overall"},
    {row:21, label:"▌ OVERALL  ·  By Funnel Stage",        t:"overall"},
    {row:30, label:"▌ OVERALL  ·  By Audience Group",      t:"overall"},
    {row:HB,    label:"⬛  HOST PERFORMANCE",              t:"host",big:true},
    {row:HB+2,  label:"▌ HOST  ·  KPIs & CAC",             t:"host"},
    {row:HB+13, label:"▌ HOST  ·  By Phase",               t:"host"},
    {row:HB+22, label:"▌ HOST  ·  By Funnel Stage",        t:"host"},
    {row:HB+31, label:"▌ HOST  ·  Prospecting — Targeting Tactic × Targeting Name", t:"host"},
    {row:HB+57, label:"▌ HOST  ·  Retargeting — Targeting Tactic × Targeting Name", t:"host"},
    {row:GB,    label:"⬛  GUEST PERFORMANCE",             t:"guest",big:true},
    {row:GB+2,  label:"▌ GUEST  ·  KPIs & CAC",            t:"guest"},
    {row:GB+13, label:"▌ GUEST  ·  By Phase",              t:"guest"},
    {row:GB+22, label:"▌ GUEST  ·  By Funnel Stage",       t:"guest"},
    {row:GB+31, label:"▌ GUEST  ·  Prospecting — Targeting Tactic × Targeting Name",t:"guest"},
    {row:GB+57, label:"▌ GUEST  ·  Retargeting — Targeting Tactic × Targeting Name",t:"guest"},
  ]

  const prPivots=[
    piv(PR_SID, 4,  [C.platform],  ALL_MET),
    piv(PR_SID, 13, [C.phase],     ALL_MET),
    piv(PR_SID, 22, [C.funnel],    ALL_MET),
    piv(PR_SID, 31, [C.audGroup],  ALL_MET),
    piv(PR_SID, HB+14,[C.phase],   HST_MET,[hostF]),
    piv(PR_SID, HB+23,[C.funnel],  HST_MET,[hostF]),
    piv(PR_SID, HB+32,[C.tgtTactic,C.tgtName],HST_MET,[hostF,prospF]),
    piv(PR_SID, HB+58,[C.tgtTactic,C.tgtName],HST_MET,[hostF,rtF]),
    piv(PR_SID, GB+14,[C.phase],   GST_MET,[guestF]),
    piv(PR_SID, GB+23,[C.funnel],  GST_MET,[guestF]),
    piv(PR_SID, GB+32,[C.tgtTactic,C.tgtName],GST_MET,[guestF,prospF]),
    piv(PR_SID, GB+58,[C.tgtTactic,C.tgtName],GST_MET,[guestF,rtF]),
  ]

  // KPI formula tables
  const kpi = (aud,startRow) => {
    const PD="'Platform Data'"
    const s=`IFERROR(SUMIF(${PD}!L:L,"${aud}",${PD}!`
    const isH=aud==="Host"
    const r=startRow
    if(isH) return [
      ["Total Ad Spend",               `=${s}AB:AB),0)`,                   "","Ad spend on Host campaigns"],
      ["Host Clicks (P1)",             `=${s}AF:AF),0)`,                   "","become_host_click"],
      ["Host Onboarding (P2)",         `=${s}AG:AG),0)`,                   "","host_onboarding_started"],
      ["Listings Created (P3)",        `=${s}AH:AH),0)`,                   "","listing_created"],
      ["","","",""],
      ["CAC — Host Click",            `=IFERROR(B${r}/B${r+1},"—")`,       "","Cost per P1 event"],
      ["CAC — Onboarding",            `=IFERROR(B${r}/B${r+2},"—")`,       "","Cost per P2 event"],
      ["CAC — Listing Created",       `=IFERROR(B${r}/B${r+3},"—")`,       "","Cost per P3 event"],
    ]
    return [
      ["Total Ad Spend",               `=${s}AB:AB),0)`,                   "","Ad spend on Guest campaigns"],
      ["New Bookings (Purchase)",       `=${s}AI:AI),0)`,                   "","Purchase conversions"],
      ["Link Clicks",                  `=${s}AE:AE),0)`,                   "",""],
      ["Impressions",                  `=${s}AC:AC),0)`,                   "",""],
      ["","","",""],
      ["CAC — New Booking",           `=IFERROR(B${r}/B${r+1},"—")`,       "","Cost per booking"],
      ["CPC (Cost per Click)",        `=IFERROR(B${r}/B${r+2},"—")`,       "",""],
      ["CPM (per 1k Impressions)",    `=IFERROR(B${r}/B${r+3}*1000,"—")`,  "",""],
    ]
  }

  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER, range:"Performance Report!A1:Z500"})
  const prLabelRows=Array.from({length:GB+95},()=>[""])
  prLabelRows[0]=["thrml — Performance Report"]
  prLabelRows[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  for(const s of prSecs) prLabelRows[s.row]=[s.label]
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:"Performance Report!A1",
    valueInputOption:"USER_ENTERED", requestBody:{values:prLabelRows}
  })
  // Write KPI tables
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:`Performance Report!A${HB+3+1}`,
    valueInputOption:"USER_ENTERED", requestBody:{values:kpi("Host",HB+4)}
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER, range:`Performance Report!A${GB+3+1}`,
    valueInputOption:"USER_ENTERED", requestBody:{values:kpi("Guest",GB+4)}
  })

  const prFmt=[
    frz(PR_SID,3,1),
    cFmt(PR_SID,0,1,0,9,{backgroundColor:ink,textFormat:{foregroundColor:white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(PR_SID,1,2,0,9,{backgroundColor:CLR2.navy,textFormat:{foregroundColor:CLR2.acc,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(PR_SID,2,3,0,9,{backgroundColor:CLR2.navy}),
    rh(PR_SID,0,1,48),rh(PR_SID,1,2,22),rh(PR_SID,2,3,8),
    ...prSecs.map(s=>{
      const bg=s.t==="host"?CLR2.host:s.t==="guest"?CLR2.guest:CLR2.sec
      return cFmt(PR_SID,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:white,bold:true,fontSize:s.big?13:11},verticalAlignment:"MIDDLE",padding:{top:s.big?10:7,bottom:s.big?10:7}})
    }),
    ...prSecs.map(s=>rh(PR_SID,s.row,s.row+1,s.big?36:28)),
    ...numFmt(PR_SID),
    cw(PR_SID,0,1,255),cw(PR_SID,1,2,105),cw(PR_SID,2,3,115),cw(PR_SID,3,4,105),
    cw(PR_SID,4,5,140),cw(PR_SID,5,6,160),cw(PR_SID,6,7,120),cw(PR_SID,7,8,90),cw(PR_SID,8,9,130),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER, requestBody:{requests:[...prPivots,...prFmt]}})
  console.log("  ✅ Performance Report: 12 pivots")

  // ── Creative tabs ──────────────────────────────────────────────────────
  const crSecs=[
    {row:3,  col:C.angle,    label:"▌ BY ANGLE"},
    {row:17, col:C.fmtType,  label:"▌ BY FORMAT TYPE"},
    {row:28, col:C.length,   label:"▌ BY LENGTH"},
    {row:39, col:C.ratio,    label:"▌ BY ASPECT RATIO"},
    {row:50, col:C.cta,      label:"▌ BY CTA"},
    {row:62, col:C.tgtName,  label:"▌ BY TARGETING NAME"},
  ]

  for(const[tabTitle,filt,met,t] of [
    ["Host Creative",  hostF,  HST_MET,"host"],
    ["Guest Creative", guestF, GST_MET,"guest"],
  ]) {
    const sid=tabMap[tabTitle]
    if(!sid){console.log(`  ⚠️ '${tabTitle}' not found`);continue}
    const bg=t==="host"?CLR2.host:CLR2.guest
    const crLabels=Array.from({length:110},()=>[""])
    crLabels[0]=[`thrml — ${tabTitle}`]
    crLabels[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
    for(const s of crSecs) crLabels[s.row]=[s.label]
    await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:`'${tabTitle}'!A1:Z300`})
    await sheets.spreadsheets.values.update({
      spreadsheetId:MASTER,range:`'${tabTitle}'!A1`,
      valueInputOption:"USER_ENTERED",requestBody:{values:crLabels}
    })
    const crPivots=crSecs.map(s=>piv(sid,SRC,s.row+1,[s.col],met,[filt]))
    const crFmt=[
      frz(sid,3,1),
      cFmt(sid,0,1,0,9,{backgroundColor:ink,textFormat:{foregroundColor:white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cFmt(sid,1,2,0,9,{backgroundColor:CLR2.navy,textFormat:{foregroundColor:CLR2.acc,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cFmt(sid,2,3,0,9,{backgroundColor:CLR2.navy}),
      rh(sid,0,1,48),rh(sid,1,2,22),rh(sid,2,3,8),
      ...crSecs.map(s=>cFmt(sid,s.row,s.row+1,0,9,{backgroundColor:bg,textFormat:{foregroundColor:white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
      ...crSecs.map(s=>rh(sid,s.row,s.row+1,28)),
      ...numFmt(sid),
      cw(sid,0,1,195),cw(sid,1,2,105),cw(sid,2,3,115),cw(sid,3,4,105),
      cw(sid,4,5,140),cw(sid,5,6,155),cw(sid,6,7,120),cw(sid,7,8,90),cw(sid,8,9,130),
    ]
    await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...crPivots,...crFmt]}})
    console.log(`  ✅ ${tabTitle}: 6 pivot tables`)
  }

  // ── Spend Breakdown ───────────────────────────────────────────────────
  const SB_SID=tabMap["Spend Breakdown"]
  const sbSecs=[
    {row:3,  col:C.platform,label:"▌ BY PLATFORM"},
    {row:13, col:C.phase,   label:"▌ BY PHASE"},
    {row:23, col:C.month,   label:"▌ BY MONTH"},
    {row:33, col:C.week,    label:"▌ BY WEEK"},
    {row:43, col:C.geo,     label:"▌ BY GEO"},
    {row:52, col:C.date,    label:"▌ BY DATE"},
  ]
  const sbLabels=Array.from({length:100},()=>[""])
  sbLabels[0]=["thrml — Spend Breakdown"]
  sbLabels[1]=[`=CONCATENATE("Last updated: ",TEXT(TODAY(),"Mmmm D, YYYY"))`]
  for(const s of sbSecs) sbLabels[s.row]=[s.label]
  await sheets.spreadsheets.values.clear({spreadsheetId:MASTER,range:"Spend Breakdown!A1:Z300"})
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER,range:"Spend Breakdown!A1",
    valueInputOption:"USER_ENTERED",requestBody:{values:sbLabels}
  })
  const sbPivots=sbSecs.map(s=>piv(SB_SID,SRC,s.row+1,[s.col],SPD_MET))
  const sbFmt=[
    frz(SB_SID,3,1),
    cFmt(SB_SID,0,1,0,4,{backgroundColor:ink,textFormat:{foregroundColor:white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
    cFmt(SB_SID,1,2,0,4,{backgroundColor:CLR2.navy,textFormat:{foregroundColor:CLR2.acc,italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
    cFmt(SB_SID,2,3,0,4,{backgroundColor:CLR2.navy}),
    rh(SB_SID,0,1,48),rh(SB_SID,1,2,22),rh(SB_SID,2,3,8),
    ...sbSecs.map(s=>cFmt(SB_SID,s.row,s.row+1,0,4,{backgroundColor:CLR2.sec,textFormat:{foregroundColor:white,bold:true,fontSize:11},verticalAlignment:"MIDDLE",padding:{top:7,bottom:7}})),
    ...sbSecs.map(s=>rh(SB_SID,s.row,s.row+1,28)),
    ...numFmt(SB_SID),
    cw(SB_SID,0,1,215),cw(SB_SID,1,2,115),cw(SB_SID,2,3,120),cw(SB_SID,3,4,110),
  ]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:MASTER,requestBody:{requests:[...sbPivots,...sbFmt]}})
  console.log("  ✅ Spend Breakdown: 6 pivots")
}

main().catch(e=>{console.error("❌",e.message,e.stack);process.exit(1)})
