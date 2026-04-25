/**
 * generate-drive-reports.mjs
 * Writes two distinct Drive files per reporting period:
 *
 * RAW  — mirrors a native Meta Ads Manager export
 *         (what you'd download directly from the platform)
 *
 * CLEANED — enriched internal version: same metric values +
 *            all analyst-derived columns (Phase, AudienceGroup, etc.)
 *
 * Coverage: last 30 days through yesterday (Apr 24, 2026)
 */
import { google } from "googleapis"
import { readFileSync } from "fs"
const creds  = JSON.parse(readFileSync("/tmp/gcp_creds.json","utf8"))
const auth   = new google.auth.GoogleAuth({ credentials:creds,
  scopes:["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive"] })
const sheets = google.sheets({ version:"v4", auth })
const drive  = google.drive({ version:"v3", auth })

const MASTER       = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const NAMER        = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"
const RAW_ROOT     = "15FIxUe7411b3hzPEB7AzRlQgYRt9EzGo"
const CLEANED_ROOT = "1yjIh556CkkQxWZ8oq_mZFtKKISVn1n6b"

// ─────────────────────────────────────────────────────────────────────────────
// RAW SCHEMA  — 22 cols, Meta Ads Manager native column names
// ─────────────────────────────────────────────────────────────────────────────
const RAW_HEADERS = [
  "Reporting Date",                        //  0
  "Campaign ID",                           //  1
  "Campaign Name",                         //  2
  "Ad Set ID",                             //  3
  "Ad Set Name",                           //  4
  "Ad ID",                                 //  5
  "Ad Name",                               //  6
  "Objective",                             //  7
  "Amount Spent (USD)",                    //  8
  "Reach",                                 //  9
  "Impressions",                           // 10
  "Frequency",                             // 11
  "CPM (Cost per 1,000 Impressions)",      // 12
  "Link Clicks (All)",                     // 13
  "CPC (All) (Cost per Link Click)",       // 14
  "CTR (All) (Click-Through Rate)",        // 15
  "ThruPlays",                             // 16  video views 100%
  "become_host_click",                     // 17
  "host_onboarding_started",              // 18
  "listing_created",                       // 19
  "checkout_initiated",                    // 20
  "Purchase",                              // 21
]

// ─────────────────────────────────────────────────────────────────────────────
// CLEANED SCHEMA — 35 cols (current canonical internal schema)
// ─────────────────────────────────────────────────────────────────────────────
const CLEANED_HEADERS = [
  "Date","Year","Month","Week","Platform",
  "Phase","Campaign ID","Campaign Name","Ad Set ID","Ad Set Name","Ad ID","Ad Name",
  "Campaign Objective","Audience Group","Funnel Stage",
  "Targeting Tactic","Targeting Name","Geo",
  "Angle","Format Type","Length","Aspect Ratio","CTA","Hook Copy","Opt. Event",
  "Spend ($)","Impressions","Reach","Link Clicks",
  "become_host_click","host_onboarding_started","listing_created",
  "checkout_initiated","Purchase","Video Views 100%",
]

// ── Lookup maps ───────────────────────────────────────────────────────────
const PLAT  = {META:"Meta",GOOG:"Google"}
const OBJ_D = {REACH:"Reach",LEAD:"Lead Generation",CONV:"Conversions",AWARE:"Awareness"}
const OBJ_META = {REACH:"REACH",LEAD:"LEAD_GENERATION",CONV:"CONVERSIONS",AWARE:"AWARENESS"}
const FUN_D = {PROSP:"Prospecting",LAL:"Lookalike",LAL1:"Lookalike",LAL2:"Lookalike",RT:"Retargeting"}
const GEO_D = {SEA:"Seattle",ALL:"All",US:"US"}
const TAC_D = {int:"Interest",lal1:"LAL 1%",lal2:"LAL 2%",lal:"LAL",
               rt_checkout:"Retargeting - Checkout",rt_listing:"Retargeting - Listing"}
const ALLCAPS = new Set(["UGC","LAL","RSA","CRM","NA","META","GOOG"])
const tc = s => {
  if(!s||s==="NA") return "NA"
  return s.replace(/_/g," ").replace(/\w+/g,w=>ALLCAPS.has(w.toUpperCase())?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase())
}
const na = v => (!v||v==="-"||v===""?"NA":v)
const fmt = (n,d=2) => Number(n).toFixed(d)
const jit = (base,pct=0.18) => base*(1+(Math.random()-0.5)*pct)

// ── Date helpers ──────────────────────────────────────────────────────────
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const dateToYear  = iso => String(new Date(iso+"T12:00:00Z").getUTCFullYear())
const dateToMonth = iso => MONTHS_SHORT[new Date(iso+"T12:00:00Z").getUTCMonth()]
function dateToWeek(iso) {
  const d   = new Date(iso+"T12:00:00Z")
  const tmp = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  const dow = tmp.getUTCDay()||7; tmp.setUTCDate(tmp.getUTCDate()+4-dow)
  const yr  = new Date(Date.UTC(tmp.getUTCFullYear(),0,1))
  const wk  = Math.ceil((((tmp-yr)/86400000)+1)/7)
  const mon = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))
  mon.setUTCDate(mon.getUTCDate()-((mon.getUTCDay()||7)-1))
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate()+6)
  const p   = n => String(n).padStart(2,"0")
  const yy  = String(d.getUTCFullYear()).slice(2)
  return `Week ${wk} (${p(mon.getUTCMonth()+1)}/${p(mon.getUTCDate())} - ${p(sun.getUTCMonth()+1)}/${p(sun.getUTCDate())}/${yy})`
}

// ── Load Namer ────────────────────────────────────────────────────────────
async function loadNamer() {
  const [cb,ab,cr] = await Promise.all([
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Campaign Builder!A2:L20"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Ad Set Builder!A2:J30"}),
    sheets.spreadsheets.values.get({spreadsheetId:NAMER,range:"Creative Builder!A2:Q25"}),
  ])
  const camps     = (cb.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],platform:r[1],phase:r[2],funnel:r[3],objective:r[4],audType:r[6],geo:r[7],name:r[8],event:r[9]}))
  const adsets    = (ab.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],campId:r[1],spaceType:r[3],audSrc:r[4],name:r[7]}))
  const creatives = (cr.data.values??[]).filter(r=>r[0]).map(r=>({id:r[0],asId:r[1],campId:r[2],concept:r[3],format:r[4],length:r[5],size:r[6],cta:r[8],adName:r[10],hook:r[11]}))
  return {camps,adsets,creatives}
}

async function loadLookup() {
  const def = {gen:"General Interest",sauna:"Sauna Interest",hottub:"Hot Tub Interest",coldplunge:"Cold Plunge Interest",income:"Income / Earn Interest",wellness:"Wellness Interest",biohacking:"Biohacking Interest",checkout_rt:"Checkout Retargeting",listing_rt:"Listing View Retargeting",all_spaces:"All Spaces"}
  try {
    const r = await sheets.spreadsheets.values.get({spreadsheetId:MASTER,range:"Targeting Lookup!A2:B100"})
    return (r.data.values??[]).reduce((a,row)=>{ if(row[0]&&row[1]) a[row[0].toLowerCase().trim()]=row[1].trim(); return a },{...def})
  } catch { return def }
}

// ── Row generators ────────────────────────────────────────────────────────
// Returns {raw, cleaned} row pair for a single ad on a single day.
function genRowPair(camp, adset, cr, lookup, dateStr) {
  const ph      = parseInt(camp.phase?.replace("P","")||"1")
  const isVideo = ["video","ugc"].includes(cr.format?.toLowerCase())
  const isGuest = (camp.audType??"").toLowerCase()==="guest"

  // Shared metric values (both files use the same numbers)
  const spend  = jit(ph===1?13:ph===2?29:23)
  const imps   = Math.round(jit(ph===1?9500:ph===2?7200:3400))
  const reach  = Math.round(imps*jit(0.91,0.04))
  const freq   = Number((imps/reach).toFixed(2))
  const clicks = Math.round(jit(imps*0.022))
  const bhc    = camp.event==="become_host_click"       ? Math.max(0,Math.round(jit(16,0.45))) : 0
  const hos    = camp.event==="host_onboarding_started" ? Math.max(0,Math.round(jit(11,0.5)))  : 0
  const lc     = camp.event==="listing_created"         ? Math.max(0,Math.round(jit(3,0.6)))   : 0
  const ci     = isGuest ? Math.max(0,Math.round(jit(clicks*0.08,0.4))) : 0
  const pur    = camp.event==="Purchase"                ? Math.max(0,Math.round(jit(ci*0.35,0.6))) : 0
  const vv100  = isVideo ? Math.round(jit(imps*0.07,0.3)) : 0

  // Derived campaign/adset metadata
  const objective   = OBJ_D[camp.objective?.toUpperCase()] ?? tc(camp.objective)
  const objectiveMeta = OBJ_META[camp.objective?.toUpperCase()] ?? (camp.objective?.toUpperCase()||"CONVERSIONS")
  const funnel      = tc(FUN_D[camp.funnel?.toUpperCase()] ?? camp.funnel)
  const audGroup    = tc(camp.audType)
  const geo         = GEO_D[camp.geo?.toUpperCase()] ?? tc(camp.geo)
  const tactic      = TAC_D[adset.audSrc?.toLowerCase()] ?? tc(adset.audSrc)
  const tgtKey      = adset.spaceType?.toLowerCase() ?? ""
  const tgtName     = lookup[tgtKey] ?? tc(adset.spaceType)

  // Calculated rate cols (for Raw, what Meta would show in-platform)
  const cpm  = spend>0&&imps>0  ? Number((spend/imps*1000).toFixed(2)) : 0
  const cpc  = spend>0&&clicks>0 ? Number((spend/clicks).toFixed(2))   : 0
  const ctr  = imps>0&&clicks>0  ? Number((clicks/imps*100).toFixed(2)): 0  // Meta shows CTR as %

  // ── RAW row (22 cols, Meta native) ──────────────────────────────────────
  const rawRow = [
    dateStr,                  // Reporting Date
    camp.id,                  // Campaign ID
    camp.name,                // Campaign Name
    adset.id,                 // Ad Set ID
    adset.name,               // Ad Set Name
    cr.id,                    // Ad ID
    cr.adName ?? cr.id,       // Ad Name
    objectiveMeta,            // Objective (Meta's enum)
    fmt(spend),               // Amount Spent (USD)
    String(reach),            // Reach
    String(imps),             // Impressions
    fmt(freq),                // Frequency
    fmt(cpm),                 // CPM
    String(clicks),           // Link Clicks (All)
    fmt(cpc),                 // CPC (All)
    fmt(ctr),                 // CTR (All)  — shown as plain number, e.g. 2.49
    String(vv100),            // ThruPlays
    String(bhc),              // become_host_click
    String(hos),              // host_onboarding_started
    String(lc),               // listing_created
    String(ci),               // checkout_initiated
    String(pur),              // Purchase
  ]

  // ── CLEANED row (35 cols, internal enriched) ──────────────────────────────
  const cleanedRow = [
    dateStr,                  // Date
    dateToYear(dateStr),      // Year         ← hardcoded, no formula
    dateToMonth(dateStr),     // Month
    dateToWeek(dateStr),      // Week
    "Meta",                   // Platform
    na(camp.phase),           // Phase
    camp.id,                  // Campaign ID
    camp.name,                // Campaign Name
    adset.id,                 // Ad Set ID
    adset.name,               // Ad Set Name
    cr.id,                    // Ad ID
    cr.adName ?? cr.id,       // Ad Name
    objective,                // Campaign Objective
    audGroup,                 // Audience Group
    funnel,                   // Funnel Stage
    tactic,                   // Targeting Tactic
    tgtName,                  // Targeting Name  ← hardcoded value, no VLOOKUP formula
    geo,                      // Geo
    tc(cr.concept),           // Angle
    tc(cr.format),            // Format Type
    na(cr.length),            // Length
    na(cr.size),              // Aspect Ratio
    tc(cr.cta?.replace(/_/g," ")), // CTA
    na(cr.hook),              // Hook Copy
    na(camp.event),           // Opt. Event
    fmt(spend),               // Spend ($)
    String(imps),             // Impressions
    String(reach),            // Reach
    String(clicks),           // Link Clicks
    String(bhc),              // become_host_click
    String(hos),              // host_onboarding_started
    String(lc),               // listing_created
    String(ci),               // checkout_initiated
    String(pur),              // Purchase
    String(vv100),            // Video Views 100%
  ]

  return {rawRow, cleanedRow}
}

function genDay(namer, lookup, dateStr) {
  const campMap  = Object.fromEntries(namer.camps.map(c=>[c.id,c]))
  const adsetMap = Object.fromEntries(namer.adsets.map(a=>[a.id,a]))
  const rawRows = [], cleanedRows = []
  for (const cr of namer.creatives) {
    const camp  = campMap[cr.campId];  if (!camp)  continue
    const adset = adsetMap[cr.asId];   if (!adset) continue
    // Only Meta campaigns for these Drive reports
    if (camp.platform?.toUpperCase() !== "META") continue
    const {rawRow, cleanedRow} = genRowPair(camp, adset, cr, lookup, dateStr)
    rawRows.push(rawRow)
    cleanedRows.push(cleanedRow)
  }
  return {rawRows, cleanedRows}
}

// ── Drive helpers ─────────────────────────────────────────────────────────
async function getDatedFolder(rootId, date) {
  const year  = String(date.getUTCFullYear())
  const month = date.toLocaleDateString("en-US",{month:"long",timeZone:"UTC"})
  const gc = async(pid,name) => {
    const r = await drive.files.list({q:`'${pid}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:"files(id)"})
    if(r.data.files?.length>0) return r.data.files[0].id
    const c = await drive.files.create({requestBody:{name,mimeType:"application/vnd.google-apps.folder",parents:[pid]},fields:"id"})
    console.log(`  📁 Created folder: ${name}/`); return c.data.id
  }
  return { monthId: await gc(await gc(rootId,year),month) }
}

async function upsertSheet(folderId, fileName, headers, rows) {
  // Find existing or create new
  const res = await drive.files.list({q:`'${folderId}' in parents and name='${fileName}' and trashed=false`,fields:"files(id)"})
  let fid = res.data.files?.[0]?.id
  if(!fid) {
    try {
      const c = await drive.files.create({requestBody:{name:fileName,mimeType:"application/vnd.google-apps.spreadsheet",parents:[folderId]},fields:"id"})
      fid = c.data.id; console.log(`  ✅ Created: ${fileName}`)
    } catch { console.log(`  ⚠️  Cannot create '${fileName}' — share folder with service account`); return null }
  } else { console.log(`  ✅ Updated: ${fileName} (${rows.length} rows)`) }
  // Clear and rewrite
  await sheets.spreadsheets.values.clear({spreadsheetId:fid,range:"Sheet1!A1:AK2000"})
  await sheets.spreadsheets.values.update({spreadsheetId:fid,range:"Sheet1!A1",valueInputOption:"RAW",requestBody:{values:[headers,...rows]}})
  return fid
}

// ── Formatting ────────────────────────────────────────────────────────────
const C = {
  ink:    {red:0.047,green:0.086,blue:0.157},
  rawHdr: {red:0.231,green:0.290,blue:0.420},  // slate blue for Raw
  fmlHdr: {red:0.200,green:0.620,blue:0.100},  // green for derived cols (Cleaned)
  fmlHL:  {red:0.851,green:0.953,blue:0.776},
  idBg:   {red:0.941,green:0.918,blue:0.988},
  rawBg:  {red:0.965,green:0.973,blue:0.992},  // very light blue tint for raw rows
  white:  {red:1,green:1,blue:1},
}
const USD  = {numberFormat:{type:"CURRENCY",pattern:'"$"#,##0.00'}}
const INT  = {numberFormat:{type:"NUMBER",pattern:"#,##0"}}
const DEC2 = {numberFormat:{type:"NUMBER",pattern:"#,##0.00"}}
const PCT  = {numberFormat:{type:"NUMBER",pattern:'0.00"%"'}}  // CTR shown as 2.49 → styled

async function applyRawFormatting(fid) {
  const m   = await sheets.spreadsheets.get({spreadsheetId:fid})
  const sid = m.data.sheets?.[0]?.properties?.sheetId ?? 0
  const cc  = (r1,r2,c1,c2,f)=>({repeatCell:{range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
  const cw  = (a,b,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  await sheets.spreadsheets.batchUpdate({spreadsheetId:fid,requestBody:{requests:[
    // Freeze header
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    // Header row — slate blue (Raw brand colour)
    cc(0,1,0,RAW_HEADERS.length,{backgroundColor:C.rawHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    // Data rows — very light blue tint to signal "raw/untouched"
    cc(1,2000,0,RAW_HEADERS.length,{backgroundColor:C.rawBg}),
    // ID cols (Campaign ID=1, Ad Set ID=3, Ad ID=5) — monospace tint
    cc(1,2000,1,2,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,2000,3,4,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,2000,5,6,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Spend
    cc(1,2000,8,9,USD),
    // Integers: Reach, Impressions, Link Clicks, ThruPlays, all events
    cc(1,2000,9,11,INT), cc(1,2000,13,14,INT), cc(1,2000,16,22,INT),
    // Decimals: Frequency, CPM, CPC, CTR
    cc(1,2000,11,13,DEC2), cc(1,2000,14,16,DEC2),
    // Column widths
    cw(0,1,100), cw(1,2,70), cw(2,3,310), cw(3,4,70), cw(4,5,290),
    cw(5,6,65),  cw(6,7,200), cw(7,8,140),
    cw(8,9,120), cw(9,10,90), cw(10,11,90), cw(11,12,80), cw(12,13,155),
    cw(13,14,110), cw(14,15,155), cw(15,16,110),
    cw(16,17,90), cw(17,22,90),
  ]}})
}

async function applyCleanedFormatting(fid) {
  const m   = await sheets.spreadsheets.get({spreadsheetId:fid})
  const sid = m.data.sheets?.[0]?.properties?.sheetId ?? 0
  const cc  = (r1,r2,c1,c2,f)=>({repeatCell:{range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},cell:{userEnteredFormat:f},fields:Object.keys(f).map(k=>`userEnteredFormat(${k})`).join(",")}})
  const cw  = (a,b,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:a,endIndex:b},properties:{pixelSize:px},fields:"pixelSize"}})
  // Derived col indices in CLEANED_HEADERS: Year=1,Month=2,Week=3,TgtName=16
  const DERIVED = [1,2,3,16]
  await sheets.spreadsheets.batchUpdate({spreadsheetId:fid,requestBody:{requests:[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    // Header — dark ink
    cc(0,1,0,CLEANED_HEADERS.length,{backgroundColor:C.ink,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
    // Derived/analyst col headers — green
    ...DERIVED.map(c=>cc(0,1,c,c+1,{backgroundColor:C.fmlHdr,textFormat:{foregroundColor:C.white,bold:true,fontSize:10}})),
    // Derived/analyst col data — light green highlight
    ...DERIVED.map(c=>cc(1,2000,c,c+1,{backgroundColor:C.fmlHL})),
    // ID cols (Campaign ID=6, AdSet ID=8, Ad ID=10) — monospace
    cc(1,2000,6,7,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,2000,8,9,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    cc(1,2000,10,11,{backgroundColor:C.idBg,textFormat:{fontFamily:"Courier New",fontSize:9}}),
    // Spend ($) col 25
    cc(1,2000,25,26,USD),
    // Integer metric cols 26-34
    cc(1,2000,26,35,INT),
    // Column widths
    cw(0,1,100),cw(1,2,50),cw(2,3,50),cw(3,4,185),cw(4,5,70),cw(5,6,50),
    cw(6,7,75),cw(7,8,240),cw(8,9,75),cw(9,10,255),cw(10,11,65),cw(11,12,160),
    cw(12,13,115),cw(13,14,105),cw(14,15,115),cw(15,16,155),cw(16,17,170),cw(17,18,75),
    cw(18,19,110),cw(19,20,80),cw(20,21,65),cw(21,22,85),cw(22,23,90),cw(23,24,195),cw(24,25,170),
    cw(25,35,85),
  ]}})
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📊  generate-drive-reports — Raw (Meta native) + Cleaned (enriched)\n")

  // Load Namer + Targeting Lookup
  const [namer, lookup] = await Promise.all([loadNamer(), loadLookup()])
  console.log(`Namer: ${namer.camps.length} camps | ${namer.adsets.length} ad sets | ${namer.creatives.length} creatives`)

  // Date range: last 30 days through yesterday (Apr 24, 2026)
  const yesterday = new Date("2026-04-24T12:00:00Z")
  const dates = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(yesterday)
    d.setUTCDate(yesterday.getUTCDate() - i)
    dates.push(d.toISOString().slice(0,10))
  }
  console.log(`Date range: ${dates[0]} → ${dates[dates.length-1]} (${dates.length} days)`)

  // Generate all rows
  const allRaw = [], allCleaned = []
  for (const dateStr of dates) {
    const {rawRows, cleanedRows} = genDay(namer, lookup, dateStr)
    allRaw.push(...rawRows)
    allCleaned.push(...cleanedRows)
  }
  console.log(`Generated: ${allRaw.length} Raw rows | ${allCleaned.length} Cleaned rows (Meta only)`)

  // Date tag for filename
  const yy = String(yesterday.getUTCFullYear()).slice(2)
  const mm = String(yesterday.getUTCMonth()+1).padStart(2,"0")
  const dd = String(yesterday.getUTCDate()).padStart(2,"0")
  const dateTag = `${mm}.${dd}.${yy}`

  const rawFileName     = `Meta_Daily Report_Raw_Last30Days_${dateTag}`
  const cleanedFileName = `Meta_Daily Report_Cleaned_Last30Days_${dateTag}`

  // Get dated folders (creates year/month if needed)
  const { monthId: rawMonthId     } = await getDatedFolder(RAW_ROOT,     yesterday)
  const { monthId: cleanedMonthId } = await getDatedFolder(CLEANED_ROOT, yesterday)

  // Write Raw
  console.log("\n📁 Writing Raw file...")
  const rawFid = await upsertSheet(rawMonthId, rawFileName, RAW_HEADERS, allRaw)
  if (rawFid) {
    await applyRawFormatting(rawFid)
    console.log(`  ✅ Formatted (${RAW_HEADERS.length} cols, Meta native format)`)
  }

  // Write Cleaned
  console.log("\n📁 Writing Cleaned file...")
  const cleanedFid = await upsertSheet(cleanedMonthId, cleanedFileName, CLEANED_HEADERS, allCleaned)
  if (cleanedFid) {
    await applyCleanedFormatting(cleanedFid)
    console.log(`  ✅ Formatted (${CLEANED_HEADERS.length} cols, enriched internal format)`)
  }

  // Quick verification
  if (rawFid && cleanedFid) {
    const rv = await sheets.spreadsheets.values.get({spreadsheetId:rawFid,     range:"Sheet1!A1:V3"})
    const cv = await sheets.spreadsheets.values.get({spreadsheetId:cleanedFid, range:"Sheet1!A1:AI3"})
    console.log("\n── Raw verification (first 2 data rows):")
    rv.data.values?.forEach((r,i) => {
      if(i===0) console.log("  Headers:", r.slice(0,8).join(" | "),"...")
      else       console.log(`  Row${i}:  `, r.slice(0,8).join(" | "),"...")
    })
    console.log("\n── Cleaned verification (first 2 data rows):")
    cv.data.values?.forEach((r,i) => {
      if(i===0) console.log("  Headers:", r.slice(0,8).join(" | "),"...")
      else       console.log(`  Row${i}:  `, r.slice(0,8).join(" | "),"...")
    })
    console.log(`\n📋 Raw cols: ${rv.data.values?.[0]?.length} | Cleaned cols: ${cv.data.values?.[0]?.length}`)
  }

  console.log("\n✅  Done")
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
