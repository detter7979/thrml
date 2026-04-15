/**
 * thrml Mock Reporting — v3
 * Uses live Namer names, new cleaned schema, full Platform Data replace each run
 * Run: node scripts/generate-mock-reporting-data.mjs
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
})
const drive  = google.drive({ version: "v3", auth })
const sheets = google.sheets({ version: "v4", auth })

const RAW_FOLDER_ID     = "15FIxUe7411b3hzPEB7AzRlQgYRt9EzGo"
const CLEANED_FOLDER_ID = "1yjIh556CkkQxWZ8oq_mZFtKKISVn1n6b"
const MASTER_ID         = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER_ID          = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// Report date formatted as MM.DD.YY
const TODAY_FORMATTED   = new Date().toLocaleDateString("en-US", { month:"2-digit",day:"2-digit",year:"2-digit" }).replace(/\//g,".")
const TODAY_ISO         = new Date().toISOString().slice(0,10)

// ── Display maps ────────────────────────────────────────────────────────────
const FUNNEL_D    = { PROSP:"Prospecting", LAL:"Lookalike", LAL1:"Lookalike", LAL2:"Lookalike", RT:"Retargeting" }
const OBJECTIVE_D = { REACH:"Reach", LEAD:"Lead", CONV:"Conversion", AWARE:"Awareness" }
const GEO_D       = { SEA:"Seattle", ALL:"All", US:"Us" }
const PLATFORM_D  = { META:"Meta", GOOG:"Google", SNAP:"Snapchat", TIKTOK:"Tiktok" }

// Targeting Tactic: combines audience source + tier into one readable field
const TACTIC_MAP = {
  int:         "Interest",
  lal1:        "LAL 1%",
  lal2:        "LAL 2%",
  lal:         "Lookalike",
  rt_checkout: "Retargeting - Checkout",
  rt_listing:  "Retargeting - Listing",
  crmatch:     "Crm Match",
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const na  = v => (!v || v === "-" || v === "—" || v === "" ? "NA" : v)
const tc  = s => {
  if (!s || s === "NA") return "NA"
  if (/^[CP]\d{3}$/.test(s) || /^(AS|AD)\d{3}$/.test(s) || /^P\d$/.test(s)) return s  // keep IDs
  return s.replace(/_/g," ").replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
const fmt = (n, d=2) => Number(n).toFixed(d)
const jit = (base, pct=0.18) => base * (1 + (Math.random()-0.5)*pct)

// ── Column schemas ────────────────────────────────────────────────────────
const RAW_HEADERS = [
  "Date","Platform",
  "Campaign ID","Campaign Name",
  "Ad Set ID","Ad Set Name",
  "Ad ID","Ad Name",
  "Impressions","Reach","Link Clicks","Spend ($)",
  "become_host_click","host_onboarding_started","listing_created","Purchase",
  "Video Views 100%",
]

// New cleaned schema: IDs added, Test ID/Status/Audience Tier removed,
// Audience Source → Targeting Tactic (with LAL% combined),
// Audience Interest → Targeting Name (lookup-controlled)
const CLEANED_HEADERS = [
  "Date","Platform",
  "Campaign ID","Ad Set ID","Ad ID",
  "Campaign Name","Ad Set Name","Ad Name",
  "Phase","Campaign Objective","Funnel Stage",
  "Audience Group","Targeting Name","Geo",
  "Space Type","Targeting Tactic","Placement",
  "Angle","Format Type","Length","Aspect Ratio","CTA",
  "Hook Copy","Opt. Event",
  "Spend ($)","Impressions","Reach","Link Clicks",
  "become_host_click","host_onboarding_started","listing_created","Purchase",
  "Video Views 100%",
]

// ── Load Targeting Lookup (from Master Report tab, user-editable) ─────────
async function loadTargetingLookup() {
  const defaults = {
    gen:"General Interest", sauna:"Sauna Interest", hottub:"Hot Tub Interest",
    coldplunge:"Cold Plunge Interest", income:"Income / Earn Interest",
    wellness:"Wellness Interest", biohacking:"Biohacking Interest",
    checkout_rt:"Checkout Retarget", listing_rt:"Listing View Retarget",
    all_spaces:"All Spaces",
  }
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId:MASTER_ID, range:"Targeting Lookup!A2:B100" })
    const rows = r.data.values ?? []
    return rows.reduce((acc, r) => { if(r[0]&&r[1]) acc[r[0].toLowerCase().trim()]=r[1].trim(); return acc }, {...defaults})
  } catch { return defaults }
}

// ── Load live Namer data ──────────────────────────────────────────────────
async function loadNamer() {
  const [cb, as, cr] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId:NAMER_ID, range:"Campaign Builder!A2:L20" }),
    sheets.spreadsheets.values.get({ spreadsheetId:NAMER_ID, range:"Ad Set Builder!A2:J30" }),
    sheets.spreadsheets.values.get({ spreadsheetId:NAMER_ID, range:"Creative Builder!A2:Q25" }),
  ])
  // Campaign Builder cols: CampID(0) Platform(1) Phase(2) Funnel(3) Objective(4) Goal(5) AudType(6) Geo(7) CampName(8) Event(9)
  const camps = (cb.data.values??[]).filter(r=>r[0]).map(r => ({
    id:r[0], platform:r[1], phase:r[2], funnel:r[3], objective:r[4],
    goal:r[5], audType:r[6], geo:r[7], name:r[8], event:r[9]
  }))
  // Ad Set Builder cols: AsID(0) CampID(1) CampName(2) SpaceType(3) AudSrc(4) Placement(5) Details(6) AdSetName(7) ConvEvent(8)
  const adsets = (as.data.values??[]).filter(r=>r[0]).map(r => ({
    id:r[0], campId:r[1], spaceType:r[3], audSrc:r[4], placement:r[5], name:r[7], event:r[8]
  }))
  // Creative Builder cols: AdID(0) AsID(1) CampID(2) Concept(3) Format(4) Length(5) Size(6) Variant(7) CTA(8) AdSetName(9) AdName(10) Hook(11) Status(12) Platform(13) Phase(14) ConvEvent(15)
  const creatives = (cr.data.values??[]).filter(r=>r[0]).map(r => ({
    id:r[0], asId:r[1], campId:r[2], concept:r[3], format:r[4],
    length:r[5], size:r[6], variant:r[7], cta:r[8], adName:r[10], hook:r[11], event:r[15]
  }))
  return { camps, adsets, creatives }
}

// ── Generate rows for a single date ──────────────────────────────────────
function genRows(namer, lookup, dateStr) {
  const campMap  = Object.fromEntries(namer.camps.map(c=>[c.id,c]))
  const adsetMap = Object.fromEntries(namer.adsets.map(a=>[a.id,a]))
  const raw=[], cleaned=[]

  for (const cr of namer.creatives) {
    const camp  = campMap[cr.campId]
    const adset = adsetMap[cr.asId]
    if (!camp || !adset) continue

    const ph      = parseInt(camp.phase?.replace("P","")||"1")
    const isVideo = ["video","ugc"].includes(cr.format?.toLowerCase())
    const isGoog  = camp.platform?.toUpperCase() === "GOOG"

    // Realistic spend / metric ranges by phase
    const baseSpend  = isGoog ? 24 : (ph===1 ? 13 : ph===2 ? 29 : 23)
    const baseImps   = isGoog ? 3800 : (ph===1 ? 9500 : ph===2 ? 7200 : 3400)
    const baseReach  = Math.round(baseImps * 0.91)
    const baseClicks = isGoog ? 260 : Math.round(baseImps * 0.022)

    const spend  = jit(baseSpend)
    const imps   = Math.round(jit(baseImps))
    const reach  = Math.round(jit(baseReach))
    const clicks = Math.round(jit(baseClicks))
    const bhc    = camp.event==="become_host_click"       ? Math.max(0,Math.round(jit(16,0.45))) : 0
    const hos    = camp.event==="host_onboarding_started" ? Math.max(0,Math.round(jit(11,0.5)))  : 0
    const lc     = camp.event==="listing_created"         ? Math.max(0,Math.round(jit(3,0.6)))   : 0
    const pur    = camp.event==="Purchase"                ? Math.max(0,Math.round(jit(2,0.7)))   : 0
    const vv100  = isVideo ? Math.round(jit(baseImps*0.07,0.3)) : 0

    // Derived cleaned values
    const platform   = na(tc(PLATFORM_D[camp.platform?.toUpperCase()] ?? camp.platform))
    const objective  = na(tc(OBJECTIVE_D[camp.objective?.toUpperCase()] ?? camp.objective))
    const funnel     = na(tc(FUNNEL_D[camp.funnel?.toUpperCase()] ?? camp.funnel))
    const audGroup   = na(tc(camp.audType))
    const geo        = na(tc(GEO_D[camp.geo?.toUpperCase()] ?? camp.geo))
    const spaceType  = na(tc(adset.spaceType))
    const tactic     = na(tc(TACTIC_MAP[adset.audSrc?.toLowerCase()] ?? adset.audSrc))
    const placement  = na(tc(adset.placement))
    const tgtName    = na(lookup[adset.spaceType?.toLowerCase()] ?? tc(adset.spaceType))
    const angle      = na(tc(cr.concept))
    const fmtType    = na(tc(cr.format))
    const length     = na(cr.length)
    const ratio      = na(cr.size)
    const cta        = na(tc(cr.cta?.replace(/_/g," ")))
    const hook       = na(cr.hook)
    const optEvent   = na(camp.event)
    const phase      = na(camp.phase)

    // RAW — platform export format (no dimension parsing, just raw metrics)
    raw.push([
      dateStr, PLATFORM_D[camp.platform?.toUpperCase()]??camp.platform,
      camp.id, camp.name,
      adset.id, adset.name,
      cr.id, cr.adName ?? cr.id,
      String(imps), String(reach), String(clicks), fmt(spend),
      String(bhc), String(hos), String(lc), String(pur), String(vv100),
    ])

    // CLEANED — fully parsed, title cased, NA-filled
    cleaned.push([
      dateStr, platform,
      camp.id, adset.id, cr.id,
      camp.name, adset.name, cr.adName ?? cr.id,
      phase, objective, funnel,
      audGroup, tgtName, geo,
      spaceType, tactic, placement,
      angle, fmtType, length, ratio, cta,
      hook, optEvent,
      fmt(spend), String(imps), String(reach), String(clicks),
      String(bhc), String(hos), String(lc), String(pur), String(vv100),
    ])
  }
  return { raw, cleaned }
}

// ── Drive: write to existing sheet or warn if none ────────────────────────
async function writeToSheet(folderId, fileName, headers, rows) {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  const id = res.data.files?.[0]?.id
  if (id) {
    await sheets.spreadsheets.values.clear({ spreadsheetId:id, range:"Sheet1!A1:Z10000" })
    await sheets.spreadsheets.values.update({
      spreadsheetId:id, range:"Sheet1!A1", valueInputOption:"RAW",
      requestBody:{ values:[headers,...rows] },
    })
    console.log(`  ✅ Updated: ${fileName} (${rows.length} rows)`)
    return id
  }
  try {
    const created = await drive.files.create({
      requestBody:{ name:fileName, mimeType:"application/vnd.google-apps.spreadsheet", parents:[folderId] },
      fields:"id",
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId:created.data.id, range:"Sheet1!A1", valueInputOption:"RAW",
      requestBody:{ values:[headers,...rows] },
    })
    console.log(`  ✅ Created: ${fileName} (${rows.length} rows)`)
    return created.data.id
  } catch(e) {
    console.log(`  ⚠️  '${fileName}' — quota exceeded. One-time setup required:`)
    console.log(`     1. Create a blank Google Sheet named '${fileName}' in the Drive folder`)
    console.log(`     2. Share with thrml-agent@watchful-muse-350902.iam.gserviceaccount.com (Editor)`)
    console.log(`     3. Re-run this script`)
    return null
  }
}

// ── Ensure Targeting Lookup tab ───────────────────────────────────────────
async function ensureTargetingLookup() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId:MASTER_ID })
  const tabs = meta.data.sheets.map(s=>({title:s.properties.title,id:s.properties.sheetId}))
  let tab = tabs.find(t=>t.title==="Targeting Lookup")
  if (!tab) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID,
      requestBody:{ requests:[{addSheet:{properties:{title:"Targeting Lookup"}}}] } })
    tab = { title:"Targeting Lookup", id:r.data.replies[0].addSheet.properties.sheetId }
  }
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId:MASTER_ID, range:"Targeting Lookup!A1:A2" })
  if ((existing.data.values??[]).length > 0) { console.log("  ✓ Targeting Lookup already populated"); return }

  const dark={red:0.102,green:0.078,blue:0.063}, white={red:1,green:1,blue:1}
  const rows=[
    ["gen","General Interest","Broad gen interest"], ["sauna","Sauna Interest","Sauna owners/enthusiasts"],
    ["hottub","Hot Tub Interest","Hot tub owners"], ["coldplunge","Cold Plunge Interest","Ice bath / cold therapy"],
    ["income","Income / Earn Interest","Passive income, Airbnb host"], ["wellness","Wellness Interest","Yoga, spa, mindfulness, Calm"],
    ["biohacking","Biohacking Interest","Wim Hof, Huberman, longevity"], ["checkout_rt","Checkout Retargeting","IC no Purchase, 14d"],
    ["listing_rt","Listing View Retargeting","ViewContent no checkout, 7d"], ["all_spaces","All Spaces","All listing types"],
  ]
  await sheets.spreadsheets.values.update({ spreadsheetId:MASTER_ID, range:"Targeting Lookup!A1",
    valueInputOption:"RAW", requestBody:{ values:[["Raw Value","Display Name","Notes"],...rows] } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID, requestBody:{ requests:[
    {updateSheetProperties:{properties:{sheetId:tab.id,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    {repeatCell:{range:{sheetId:tab.id,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:3},
      cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true},padding:{top:5,bottom:5}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,padding)"}},
    {updateDimensionProperties:{range:{sheetId:tab.id,dimension:"COLUMNS",startIndex:0,endIndex:1},properties:{pixelSize:130},fields:"pixelSize"}},
    {updateDimensionProperties:{range:{sheetId:tab.id,dimension:"COLUMNS",startIndex:1,endIndex:2},properties:{pixelSize:200},fields:"pixelSize"}},
    {updateDimensionProperties:{range:{sheetId:tab.id,dimension:"COLUMNS",startIndex:2,endIndex:3},properties:{pixelSize:270},fields:"pixelSize"}},
  ]}})
  console.log("  ✅ Targeting Lookup seeded — edit 'Display Name' to update all reports globally")
}

// ── Format Platform Data tab ──────────────────────────────────────────────
async function formatPlatformData() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId:MASTER_ID })
  const sid  = meta.data.sheets.find(s=>s.properties.title==="Platform Data")?.properties.sheetId
  if (sid === undefined) return
  const dark={red:0.102,green:0.078,blue:0.063}, white={red:1,green:1,blue:1}
  const purple={red:0.94,green:0.92,blue:0.99}, amber={red:1.0,green:0.94,blue:0.8}
  const tgtTint={red:0.85,green:0.80,blue:0.99} // stronger tint for Targeting Name header
  const cw=(s,e,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID, requestBody:{ requests:[
    {updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    {repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:CLEANED_HEADERS.length},
      cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"}},
    // ID cols 2,3,4 — purple monospace
    {repeatCell:{range:{sheetId:sid,startRowIndex:1,endRowIndex:500,startColumnIndex:2,endColumnIndex:5},
      cell:{userEnteredFormat:{backgroundColor:purple,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}},fields:"userEnteredFormat(backgroundColor,textFormat)"}},
    // Targeting Name header (index 12) stronger tint
    {repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1,startColumnIndex:12,endColumnIndex:13},
      cell:{userEnteredFormat:{backgroundColor:tgtTint,textFormat:{foregroundColor:{red:0.1,green:0.05,blue:0.3},bold:true,fontSize:10}}},fields:"userEnteredFormat(backgroundColor,textFormat)"}},
    // Format group headers 18,19,20 — amber
    {repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1,startColumnIndex:18,endColumnIndex:21},
      cell:{userEnteredFormat:{backgroundColor:amber,textFormat:{foregroundColor:dark,bold:true,fontSize:10}}},fields:"userEnteredFormat(backgroundColor,textFormat)"}},
    cw(0,1,90),cw(1,2,70),cw(2,3,75),cw(3,4,75),cw(4,5,65),
    cw(5,6,230),cw(6,7,250),cw(7,8,155),
    cw(8,9,50),cw(9,10,110),cw(10,11,110),
    cw(11,12,95),cw(12,13,170),cw(13,14,75),
    cw(14,15,90),cw(15,16,155),cw(16,17,130),
    cw(17,18,110),cw(18,19,80),cw(19,20,65),cw(20,21,85),cw(21,22,90),
    cw(22,23,190),cw(23,24,175),
    cw(24,34,80),
  ]}})
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 thrml Mock Reporting — ${TODAY_FORMATTED}\n`)

  // 1. Targeting Lookup
  console.log("📋 Targeting Lookup tab...")
  await ensureTargetingLookup()

  // 2. Load Namer + lookup
  console.log("\n📖 Loading Namer + lookup...")
  const [namer, lookup] = await Promise.all([loadNamer(), loadTargetingLookup()])
  console.log(`   ${namer.camps.length} campaigns | ${namer.adsets.length} ad sets | ${namer.creatives.length} creatives`)

  // 3. Generate 7 days of data
  const allRaw=[], allCleaned=[]
  for (let d=6; d>=0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate()-d)
    const iso = dt.toISOString().slice(0,10)
    const { raw, cleaned } = genRows(namer, lookup, iso)
    allRaw.push(...raw); allCleaned.push(...cleaned)
  }
  console.log(`   Generated: ${allRaw.length} raw rows | ${allCleaned.length} cleaned rows (7 days × ${namer.creatives.length} ads)`)

  // 4. Raw file in Drive (today's slice)
  const { raw: todayRaw } = genRows(namer, lookup, TODAY_ISO)
  console.log(`\n📁 Raw folder: Meta_Daily Report_${TODAY_FORMATTED}`)
  await writeToSheet(RAW_FOLDER_ID, `Meta_Daily Report_${TODAY_FORMATTED}`, RAW_HEADERS, todayRaw)

  // 5. Cleaned file in Drive (today's slice)
  const { cleaned: todayCleaned } = genRows(namer, lookup, TODAY_ISO)
  console.log(`📁 Cleaned folder: Meta_Cleaned_${TODAY_FORMATTED}`)
  await writeToSheet(CLEANED_FOLDER_ID, `Meta_Cleaned_${TODAY_FORMATTED}`, CLEANED_HEADERS, todayCleaned)

  // 6. Full replace Platform Data tab (7-day history)
  console.log("\n📊 Replacing Platform Data tab (7 days)...")
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER_ID, range:"Platform Data!A1:AZ10000" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER_ID, range:"Platform Data!A1", valueInputOption:"RAW",
    requestBody:{ values:[CLEANED_HEADERS,...allCleaned] },
  })
  console.log(`  ✅ Platform Data: ${allCleaned.length} rows`)

  // 7. Format
  await formatPlatformData()
  console.log("  ✅ Formatted")

  // Summary
  console.log(`\n✅ Done — ${CLEANED_HEADERS.length} columns, ${allCleaned.length} rows`)
  console.log(`   Sample Targeting Names: ${[...new Set(allCleaned.map(r=>r[12]))].slice(0,4).join(", ")}`)
  console.log(`   Sample Targeting Tactics: ${[...new Set(allCleaned.map(r=>r[15]))].slice(0,5).join(", ")}`)
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}`)
  console.log(`💡 Edit 'Targeting Lookup' tab → Display Name to control all Targeting Name values\n`)
}

main().catch(e=>{ console.error("❌",e.message); process.exit(1) })
