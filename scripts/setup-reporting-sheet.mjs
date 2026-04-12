import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"
const NAMER_ID  = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// ── Real Platform Data columns (no calculated metrics) ───────────────────
const PLATFORM_DATA_HEADERS = [
  // Date + Platform
  "Date", "Platform",
  // Naming hierarchy (raw)
  "Campaign Name", "Ad Set Name", "Ad Name",
  // Parsed — Campaign level
  "Phase", "Campaign Objective", "Funnel Stage",
  "Audience Type", "Audience Group", "Geo",
  // Parsed — Ad Set level
  "Space Type", "Audience Source", "Placement",
  // Parsed — Ad level
  "Test ID", "Variant", "Angle", "Format", "CTA",
  // From Creative Builder lookup
  "Hook Copy", "Status", "Opt. Event",
  // Raw metrics — no calculated fields
  "Spend ($)", "Impressions", "Reach", "Link Clicks",
  // Conversion events (per phase)
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  // Video
  "Video Views 25%",
]

// ── Inline name parser (matches naming-parser.ts) ─────────────────────────
const PLATFORM_MAP  = { META:"Meta", GOOG:"Google", SNAP:"Snapchat", TIKTOK:"TikTok" }
const OBJECTIVE_MAP = { REACH:"Reach", LEAD:"Lead", CONV:"Conversion", AWARE:"Awareness" }
const FUNNEL_MAP    = { PROSP:"Prospecting", LAL:"Lookalike", LAL1:"Lookalike (1%)", LAL2:"Lookalike (2%)", RT:"Retargeting", CRM:"CRM" }
const GEO_MAP       = { ALL:"All", SEA:"Seattle", US:"US", LA:"Los Angeles", SF:"San Francisco" }
const SPACE_MAP     = { GEN:"General", SAUNA:"Sauna", HOTTUB:"Hot Tub", COLDPLUNGE:"Cold Plunge" }
const AUD_SRC_MAP   = { INT:"Interest", LAL1:"1% LAL", LAL2:"2% LAL", CRMATCH:"CRM Match", RT:"Retarget" }
const PLACEMENT_MAP = { "FEED-STORIES":"Feed + Stories", FEED:"Feed", REELS:"Reels", SEARCH:"Search", PMAX:"Performance Max", "DEMAND-GEN":"Demand Gen" }
const FORMAT_MAP    = { "STATIC_9X16":"Static 9:16","STATIC_1X1":"Static 1:1","VIDEO_15S":"Video 15s","VIDEO_30S":"Video 30s",CAROUSEL:"Carousel",UGC:"UGC",RSA:"RSA" }
const CTA_MAP       = { LIST_NOW:"List Now",LEARN_MORE:"Learn More",GET_STARTED:"Get Started",SEE_HOW:"See How",BOOK_NOW:"Book Now" }
const KNOWN_GEOS    = new Set(Object.keys(GEO_MAP))
const KNOWN_FORMATS = new Set(Object.keys(FORMAT_MAP))
const KNOWN_CTAS    = new Set(Object.keys(CTA_MAP))

function parseAd(name) {
  const parts = (name||"").trim().split("_").filter(Boolean)
  const r = { platform:"",phase:"",campaignObjective:"",funnelStage:"",
    audienceType:"",audienceGroup:"",geo:"",spaceType:"",audienceSource:"",
    placement:"",testId:"",variant:"",angle:"",format:"",cta:"",optEvent:"" }
  let c = 0
  if (PLATFORM_MAP[parts[c]?.toUpperCase()]) r.platform = PLATFORM_MAP[parts[c++].toUpperCase()]
  if (/^P\d+$/i.test(parts[c]??'')) r.phase = parts[c++].toUpperCase()
  if (OBJECTIVE_MAP[parts[c]?.toUpperCase()]) r.campaignObjective = OBJECTIVE_MAP[parts[c++].toUpperCase()]
  if (FUNNEL_MAP[parts[c]?.toUpperCase()]) r.funnelStage = FUNNEL_MAP[parts[c++].toUpperCase()]
  // Audience type: host_* or guest_* (2 tokens)
  const at1 = parts[c]?.toLowerCase(), at2 = parts[c+1]?.toLowerCase()
  if (at1 && (at1==="host"||at1==="guest") && at2 && !KNOWN_GEOS.has(at2.toUpperCase())) {
    r.audienceType=`${at1}_${at2}`; r.audienceGroup=at1==="host"?"Host":"Guest"; c+=2
  }
  if (KNOWN_GEOS.has(parts[c]?.toUpperCase())) { r.geo=GEO_MAP[parts[c].toUpperCase()]; c++ }
  if (SPACE_MAP[parts[c]?.toUpperCase()]) { r.spaceType=SPACE_MAP[parts[c++].toUpperCase()] }
  if (AUD_SRC_MAP[parts[c]?.toUpperCase()]) { r.audienceSource=AUD_SRC_MAP[parts[c++].toUpperCase()] }
  // Placement (may contain hyphens, ends at T\d+)
  const pParts = []
  while (c < parts.length && !(/^T\d+$/i.test(parts[c]))) pParts.push(parts[c++])
  const pk = pParts.join("-").toUpperCase()
  r.placement = PLACEMENT_MAP[pk] || pParts.join("-")
  // Ad level: find T\d+
  const ti = parts.findIndex(p => /^T\d+$/i.test(p))
  if (ti >= 0) {
    let ac = ti
    r.testId = parts[ac++]
    r.variant = parts[ac++]?.toUpperCase() ?? ""
    // Angle: until FORMAT
    const aParts = []
    while (ac < parts.length) {
      const f1 = parts[ac]?.toUpperCase(), f2 = parts[ac+1]?.toUpperCase()
      if (KNOWN_FORMATS.has(`${f1}_${f2}`) || KNOWN_FORMATS.has(f1)) break
      aParts.push(parts[ac++])
    }
    r.angle = aParts.join("_")
    // Format (1 or 2 tokens)
    const f1 = parts[ac]?.toUpperCase(), f2 = parts[ac+1]?.toUpperCase()
    if (KNOWN_FORMATS.has(`${f1}_${f2}`)) { r.format=FORMAT_MAP[`${f1}_${f2}`]; ac+=2 }
    else if (KNOWN_FORMATS.has(f1)) { r.format=FORMAT_MAP[f1]; ac++ }
    // CTA
    const ck = parts[ac]?.toUpperCase()
    r.cta = KNOWN_CTAS.has(ck) ? CTA_MAP[ck] : (parts[ac]??'')
    // Derive opt event from phase + audience group
    const ph = parseInt(r.phase.replace("P",""))
    if (r.audienceGroup==="Host") r.optEvent = ph===1?"become_host_click":ph===2?"host_onboarding_started":"listing_created"
    else r.optEvent = ph<=2?"ViewContent":"Purchase"
  }
  return r
}

// ── Creative Builder lookup (Test ID → Hook Copy, Status) ─────────────────
async function loadCreativeBuilder() {
  const map = new Map() // TestID+Variant → { hook, status, optEvent }
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: NAMER_ID, range: "'④ Creative Builder'!A3:K50"
    })
    for (const row of r.data.values ?? []) {
      const [testId, variant, , , , , hook, status, , , optEvent] = row
      if (testId && variant) map.set(`${testId}_${variant}`, { hook: hook||"", status: status||"", optEvent: optEvent||"" })
    }
  } catch(e) { console.warn("Creative Builder read failed:", e.message) }
  return map
}

// ── Fake campaigns using real naming convention ───────────────────────────
const FAKE_ADS = [
  { // Host acquisition — P1, Prospecting, sauna interest, feed
    adName: "META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES_T01_A_income_Static_9x16_list_now",
    spend: 18.5,  imps: 12400, reach: 11200, clicks: 310,
    bhc: 22, hos: 0, lc: 0, purch: 0, vv25: 180, status: "Live"
  },
  { // Host acquisition — P1, Challenger B
    adName: "META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES_T01_B_community_Static_9x16_list_now",
    spend: 14.2,  imps: 9800,  reach: 9100,  clicks: 240,
    bhc: 16, hos: 0, lc: 0, purch: 0, vv25: 120, status: "Testing"
  },
  { // Host P2 — LAL, onboarding push, video
    adName: "META_P2_LEAD_LAL_host_gen_ALL_sauna_lal1_FEED-STORIES_T02_A_idle_space_Video_15s_get_started",
    spend: 22.0,  imps: 8200,  reach: 7600,  clicks: 195,
    bhc: 0, hos: 14, lc: 0, purch: 0, vv25: 2800, status: "Draft"
  },
  { // Guest P3 — Retargeting, checkout
    adName: "META_P3_CONV_RT_guest_wellness_ALL_sauna_rt_FEED-STORIES_T04_A_fomo_Static_9x16_book_now",
    spend: 31.0,  imps: 4400,  reach: 4100,  clicks: 380,
    bhc: 0, hos: 0, lc: 0, purch: 6, vv25: 0, status: "Draft"
  },
  { // Google Search — Host P1
    adName: "GOOG_P1_CONV_PROSP_host_gen_SEA_gen_int_SEARCH_T01_A_income_RSA_list_now",
    spend: 24.5,  imps: 3200,  reach: 3200,  clicks: 290,
    bhc: 18, hos: 0, lc: 0, purch: 0, vv25: 0, status: "Live"
  },
]

function jitter(base, pct=0.2) { return base*(1+(Math.random()-0.5)*pct) }
function fmt(n,d=2) { return Number(n).toFixed(d) }

function generateFakeRows(creativeMap) {
  const rows = []
  const today = new Date()
  for (let d=6; d>=0; d--) {
    const date = new Date(today); date.setDate(date.getDate()-d)
    const ds = date.toISOString().slice(0,10)
    for (const ad of FAKE_ADS) {
      const p = parseAd(ad.adName)
      const creative = creativeMap.get(`${p.testId}_${p.variant}`) ?? {}
      const spend  = jitter(ad.spend)
      const imps   = Math.round(jitter(ad.imps))
      const reach  = Math.round(jitter(ad.reach))
      const clicks = Math.round(jitter(ad.clicks))
      const bhc    = Math.max(0, Math.round(jitter(ad.bhc, 0.5)))
      const hos    = Math.max(0, Math.round(jitter(ad.hos, 0.5)))
      const lc     = Math.max(0, Math.round(jitter(ad.lc, 0.5)))
      const purch  = Math.max(0, Math.round(jitter(ad.purch, 0.6)))
      const vv25   = ad.vv25 > 0 ? Math.round(jitter(ad.vv25)) : 0
      rows.push([
        ds, p.platform,
        // Extract campaign and ad set names from full ad name
        // Campaign = first 6 underscore tokens (platform_phase_obj_funnel_at1_at2_geo)
        ad.adName.split("_").slice(0, ad.adName.startsWith("GOOG") ? 7 : 7).join("_"),
        ad.adName.split("_").slice(0, 11).join("_"), // ad set = first ~11 tokens
        ad.adName,
        // Parsed campaign-level
        p.phase, p.campaignObjective, p.funnelStage,
        p.audienceType, p.audienceGroup, p.geo,
        // Parsed ad set-level
        p.spaceType, p.audienceSource, p.placement,
        // Parsed ad-level
        p.testId, p.variant, p.angle, p.format, p.cta,
        // Creative Builder lookup
        creative.hook ?? "", creative.status ?? ad.status, creative.optEvent ?? p.optEvent,
        // Raw metrics
        fmt(spend), String(imps), String(reach), String(clicks),
        // Conversion events
        String(bhc), String(hos), String(lc), String(purch),
        // Video
        String(vv25),
      ])
    }
  }
  return rows
}

// ── Fixed Costs ───────────────────────────────────────────────────────────
const FC_HEADERS = ["Item", "Category", "Monthly ($)", "Annual ($)", "Notes"]
const FC_ROWS = [
  ["Redis",            "Infrastructure", "7.00",   "84.00",    "Upstash/RedisLabs"],
  ["Resend Starter",   "Infrastructure", "20.00",  "240.00",   "Transactional email API"],
  ["Zoho Mail Basic",  "Infrastructure", "1.00",   "12.00",    "hello@usethrml.com"],
  ["Domain / DNS",     "Infrastructure", "1.67",   "20.00",    "$20/yr"],
  ["Vercel",           "Infrastructure", "0.00",   "0.00",     "Hobby — free"],
  ["Supabase",         "Infrastructure", "0.00",   "0.00",     "Free tier"],
  ["Google Cloud",     "Infrastructure", "0.00",   "0.00",     "Service account — free"],
  ["Business Insurance","Operations",   "50.00",  "600.00",   "General liability"],
  ["Midjourney",       "Creative",       "10.00",  "120.00",   "Basic plan"],
  ["Cursor",           "Development",    "20.00",  "240.00",   "Pro plan"],
  [],
  ["TOTAL FIXED",      "",               "109.67", "1316.00",  ""],
]

// ── Ad Hoc Costs ──────────────────────────────────────────────────────────
const AH_HEADERS = ["Date", "Item", "Category", "Amount ($)", "Notes", "Month"]
const todayStr = new Date().toISOString().slice(0,10)
const monthStr = new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"})
const AH_SAMPLE = [
  [todayStr, "Anthropic API",         "AI",       "4.20",  "Claude API usage",              monthStr],
  [todayStr, "Stripe Processing Fees","Payment",  "2.87",  "2.9%+$0.30 per booking",        monthStr],
  [todayStr, "Stock photo license",   "Creative", "15.00", "One-off asset",                 monthStr],
]

// ── Overview builder ──────────────────────────────────────────────────────
function buildOverview(rows) {
  const today = new Date()
  // Column indices (0-based in data rows)
  const iSpend=21, iImps=22, iReach=23, iClicks=24
  const iBHC=25, iHOS=26, iLC=27, iPurch=28, iVV=29
  const iPlatform=1, iPhase=5, iFunnel=7, iAudGroup=9, iTestId=14

  function agg(filter) {
    let spend=0,imps=0,clicks=0,bhc=0,hos=0,lc=0,purch=0
    for (const r of rows) {
      if (!filter(r)) continue
      spend+=parseFloat(r[iSpend]||0); imps+=parseInt(r[iImps]||0)
      clicks+=parseInt(r[iClicks]||0); bhc+=parseInt(r[iBHC]||0)
      hos+=parseInt(r[iHOS]||0); lc+=parseInt(r[iLC]||0); purch+=parseInt(r[iPurch]||0)
    }
    return {spend,imps,clicks,bhc,hos,lc,purch}
  }

  const total  = agg(()=>true)
  const meta   = agg(r=>r[iPlatform]==="Meta")
  const google = agg(r=>r[iPlatform]==="Google")
  const prosp  = agg(r=>r[iFunnel]==="Prospecting")
  const retarg = agg(r=>r[iFunnel]==="Retargeting")
  const host   = agg(r=>r[iAudGroup]==="Host")
  const guest  = agg(r=>r[iAudGroup]==="Guest")
  const p1     = agg(r=>r[iPhase]==="P1")
  const p2     = agg(r=>r[iPhase]==="P2")
  const p3     = agg(r=>r[iPhase]==="P3")

  // By campaign
  const byCamp = {}
  for (const r of rows) {
    const k = r[2]; if (!k) continue
    if (!byCamp[k]) byCamp[k] = {spend:0,imps:0,clicks:0,bhc:0,hos:0,lc:0,purch:0}
    const d=byCamp[k]; d.spend+=parseFloat(r[iSpend]||0); d.imps+=parseInt(r[iImps]||0)
    d.clicks+=parseInt(r[iClicks]||0); d.bhc+=parseInt(r[iBHC]||0)
    d.hos+=parseInt(r[iHOS]||0); d.lc+=parseInt(r[iLC]||0); d.purch+=parseInt(r[iPurch]||0)
  }
  // By ad set
  const byAdSet = {}
  for (const r of rows) {
    const k = r[3]; if (!k) continue
    if (!byAdSet[k]) byAdSet[k] = {spend:0,imps:0,clicks:0,bhc:0,hos:0,lc:0,purch:0}
    const d=byAdSet[k]; d.spend+=parseFloat(r[iSpend]||0); d.imps+=parseInt(r[iImps]||0)
    d.clicks+=parseInt(r[iClicks]||0); d.bhc+=parseInt(r[iBHC]||0)
    d.hos+=parseInt(r[iHOS]||0); d.lc+=parseInt(r[iLC]||0); d.purch+=parseInt(r[iPurch]||0)
  }
  // By ad
  const byAd = {}
  for (const r of rows) {
    const k = r[4]; if (!k) continue
    if (!byAd[k]) byAd[k] = {spend:0,imps:0,clicks:0,bhc:0,hos:0,lc:0,purch:0}
    const d=byAd[k]; d.spend+=parseFloat(r[iSpend]||0); d.imps+=parseInt(r[iImps]||0)
    d.clicks+=parseInt(r[iClicks]||0); d.bhc+=parseInt(r[iBHC]||0)
    d.hos+=parseInt(r[iHOS]||0); d.lc+=parseInt(r[iLC]||0); d.purch+=parseInt(r[iPurch]||0)
  }

  const fixedMonthly=109.67, days=7
  const estOpex = fixedMonthly/30*days

  function row(label,d) {
    return [label, `$${fmt(d.spend)}`, String(d.imps), String(d.clicks),
      String(d.bhc), String(d.hos), String(d.lc), String(d.purch)]
  }
  const COL_H = ["", "Spend ($)", "Impressions", "Clicks",
    "become_host_click", "host_onboarding_started", "listing_created", "Purchase"]

  return [
    ["thrml Platform Performance Overview — Last 7 Days","","","","","","",""],
    [`As of ${today.toDateString()}  |  ${new Date(today-6*86400000).toISOString().slice(0,10)} → ${today.toISOString().slice(0,10)}`,"","","","","","",""],
    [""],
    ["💰  P&L SUMMARY","7-Day","Monthly Est.","","","","",""],
    ["Total Ad Spend",        `$${fmt(total.spend)}`,   `$${fmt(total.spend/days*30)}`,"","","","",""],
    ["Fixed OpEx (est.)",    `-$${fmt(estOpex)}`,       `-$${fmt(fixedMonthly)}`,"","","","",""],
    ["Variable OpEx",         "see Ad Hoc tab","","","","","",""],
    [""],
    ["📊  BY PLATFORM", ...COL_H.slice(1)],
    row("Meta",   meta),
    row("Google", google),
    row("TOTAL",  total),
    [""],
    ["📈  BY PHASE", ...COL_H.slice(1)],
    row("P1 — Awareness / Reach", p1),
    row("P2 — Lead / Onboarding",  p2),
    row("P3 — Conversion",         p3),
    [""],
    ["🎯  BY FUNNEL STAGE", ...COL_H.slice(1)],
    row("Prospecting", prosp),
    row("Retargeting", retarg),
    [""],
    ["👥  BY AUDIENCE GROUP", ...COL_H.slice(1)],
    row("Host",  host),
    row("Guest", guest),
    [""],
    ["📋  BY CAMPAIGN", ...COL_H.slice(1)],
    ...Object.entries(byCamp).map(([k,d]) => row(k,d)),
    [""],
    ["📋  BY AD SET", ...COL_H.slice(1)],
    ...Object.entries(byAdSet).map(([k,d]) => row(k,d)),
    [""],
    ["🎨  BY AD", ...COL_H.slice(1)],
    ...Object.entries(byAd).map(([k,d]) => row(k,d)),
    [""],
    ["* No calculated metrics shown. Raw event counts only.","","","","","","",""],
  ]
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🛠  thrml Master Report — Full Rebuild (v3)\n")

  // Load Creative Builder lookup
  console.log("📖 Loading Creative Builder...")
  const creativeMap = await loadCreativeBuilder()
  console.log(`   ${creativeMap.size} creative entries loaded`)

  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabMap = {}
  meta.data.sheets.forEach(t => { tabMap[t.properties.title] = t.properties.sheetId })

  // Ensure required tabs exist
  const required = ["Fixed Costs", "Ad Hoc Costs", "Platform Data", "Overview"]
  const toCreate = required.filter(t => !tabMap[t])
  if (toCreate.length) {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID,
      requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) }
    })
    res.data.replies.forEach((r,i) => { tabMap[toCreate[i]] = r.addSheet.properties.sheetId })
    console.log("Created tabs:", toCreate.join(", "))
  }

  const rows = generateFakeRows(creativeMap)
  console.log(`📊 Generated ${rows.length} fake data rows`)

  // Write all tabs
  const writes = [
    { range: "Fixed Costs!A1",    values: [FC_HEADERS, ...FC_ROWS] },
    { range: "Ad Hoc Costs!A1",   values: [
      ["⬇ Add variable/one-time costs below. Month column groups for MTD view.","","","","",""],
      AH_HEADERS, ...AH_SAMPLE
    ]},
    { range: "Platform Data!A1",  values: [PLATFORM_DATA_HEADERS, ...rows] },
    { range: "Overview!A1",       values: buildOverview(rows) },
  ]

  for (const w of writes) {
    await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: w.range,
      valueInputOption: "RAW", requestBody: { values: w.values } })
    console.log(`✅ ${w.range.split("!")[0]}`)
  }

  // Format
  console.log("\n🎨 Formatting...")
  const dark     = {red:0.102,green:0.078,blue:0.063}
  const white    = {red:1,green:1,blue:1}
  const gray     = {red:0.93,green:0.93,blue:0.93}
  const pd=tabMap["Platform Data"], fc=tabMap["Fixed Costs"]
  const ah=tabMap["Ad Hoc Costs"],  ov=tabMap["Overview"]

  const hdr = (sid,row,cols,bg,fg) => ({repeatCell:{
    range:{sheetId:sid,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:cols},
    cell:{userEnteredFormat:{backgroundColor:bg,textFormat:{foregroundColor:fg,bold:true,fontSize:10},
      verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}},
    fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
  }})
  const freeze=(sid,n)=>({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:n}},fields:"gridProperties.frozenRowCount"}})
  const cw=(sid,s,e,px)=>({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
    // Platform Data
    freeze(pd,1), hdr(pd,0,PLATFORM_DATA_HEADERS.length,dark,white),
    cw(pd,0,1,90),  // Date
    cw(pd,1,2,65),  // Platform
    cw(pd,2,3,230), // Campaign Name
    cw(pd,3,4,260), // Ad Set Name
    cw(pd,4,5,290), // Ad Name
    cw(pd,5,6,50),  // Phase
    cw(pd,6,7,110), // Campaign Objective
    cw(pd,7,8,105), // Funnel Stage
    cw(pd,8,9,110), // Audience Type
    cw(pd,9,10,80), // Audience Group
    cw(pd,10,11,65),// Geo
    cw(pd,11,12,80),// Space Type
    cw(pd,12,13,100),// Audience Source
    cw(pd,13,14,110),// Placement
    cw(pd,14,15,55),// Test ID
    cw(pd,15,16,55),// Variant
    cw(pd,16,17,90),// Angle
    cw(pd,17,18,90),// Format
    cw(pd,18,19,85),// CTA
    cw(pd,19,20,200),// Hook Copy
    cw(pd,20,21,65),// Status
    cw(pd,21,22,85),// Opt Event
    cw(pd,22,30,80),// Metrics

    // Fixed Costs
    freeze(fc,1), hdr(fc,0,5,dark,white),
    cw(fc,0,1,190), cw(fc,1,2,120), cw(fc,2,4,95), cw(fc,4,5,250),

    // Ad Hoc
    freeze(ah,2), hdr(ah,0,6,gray,dark), hdr(ah,1,6,dark,white),
    cw(ah,0,1,100), cw(ah,1,2,190), cw(ah,2,3,120), cw(ah,3,4,95), cw(ah,4,5,220), cw(ah,5,6,100),

    // Overview
    freeze(ov,2),
    {repeatCell:{range:{sheetId:ov,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:8},
      cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true,fontSize:13},padding:{top:10,bottom:10}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,padding)"}},
    cw(ov,0,1,310), cw(ov,1,8,120),
  ]}})

  console.log(`✅ Formatting applied`)
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
