import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── Column schema ─────────────────────────────────────────────────────────
// NO calculated metrics (CTR, CPC, CPM, ROAS, CPA removed)
// Naming columns renamed to match their actual values

const PLATFORM_DATA_HEADERS = [
  // Date & platform
  "Date", "Platform",
  // Hierarchy IDs
  "Campaign ID", "Ad Set ID", "Ad ID",
  // Hierarchy names (raw from platform)
  "Campaign Name", "Ad Set Name", "Ad Name",
  // Parsed naming convention — named to match values
  "Phase",              // P1 / P2 / P3
  "Campaign Objective", // Conversion | Awareness | Traffic | Lead
  "Funnel Stage",       // Prospecting | Retargeting | Lookalike | Broad
  "Audience",           // Guest | Host
  "Creative Concept",   // checkout_rt | sauna | earn | booking
  "Market",             // All | Seattle | LA | etc.
  // Ad-level creative attributes (from Creative Builder)
  "Creative Format",    // Video | Image | Carousel | Story | RSA
  "Aspect Ratio",       // 9:16 | 1:1 | 4:5 | 16:9 | Text
  "Creative Version",   // v1 | v2 | v3
  "Hook",               // Opening line / first 3s concept
  "Headline",           // Ad headline
  "Primary Text",       // Body copy
  "CTA",                // Book Now | Learn More | Sign Up | Get Started
  "Landing Page",       // Destination URL slug
  // Raw metrics only — no calculated fields
  "Spend",
  "Impressions",
  "Clicks",
  "Purchases",
  "Revenue",
  // Video engagement (Meta only, blank for Google)
  "3s Views",
  "50% Views",
  "100% Views",
]

// ── Name parser ───────────────────────────────────────────────────────────
function parseName(name) {
  const PM = { META:"Meta",FB:"Meta",GOOG:"Google",GA:"Google",GG:"Google",TT:"TikTok",SNAP:"Snapchat" }
  const OM = { CONV:"Conversion",AWARE:"Awareness",TRAF:"Traffic",LEAD:"Lead",APP:"App",VV:"Video Views",REACH:"Reach",ENG:"Engagement" }
  const FM = { RT:"Retargeting",RET:"Retargeting",PRO:"Prospecting",LAL:"Lookalike",BROAD:"Broad",INT:"Interest" }
  const GM = { GUEST:"Guest",BOOKING:"Guest",BOOK:"Guest",HOST:"Host",EARN:"Host",LIST:"Host" }
  const MM = { ALL:"All",SEA:"Seattle",LA:"Los Angeles",SF:"San Francisco",NYC:"New York",US:"US",CHI:"Chicago",PDX:"Portland" }
  const KM = new Set(Object.keys(MM))
  const parts = (name||"").trim().split("_").filter(Boolean)
  let c = 0
  const r = {platform:"",phase:"",objective:"",funnelStage:"",audience:"",concept:"",market:""}
  if (PM[parts[c]?.toUpperCase()]) r.platform = PM[parts[c++].toUpperCase()]
  if (/^P\d+$/i.test(parts[c])) r.phase = parts[c++].toUpperCase()
  if (OM[parts[c]?.toUpperCase()]) r.objective = OM[parts[c++].toUpperCase()]
  if (FM[parts[c]?.toUpperCase()]) r.funnelStage = FM[parts[c++].toUpperCase()]
  if (GM[parts[c]?.toUpperCase()]) r.audience = GM[parts[c++].toUpperCase()]
  const last = parts[parts.length-1]?.toUpperCase()
  let mEnd = parts.length
  if (KM.has(last)) { r.market = MM[last]; mEnd-- }
  r.concept = parts.slice(c, mEnd).join("_")
  return r
}

function fmt(n,d=2) { return Number(n).toFixed(d) }
function jitter(base,pct=0.25) { return base*(1+(Math.random()-0.5)*pct) }

// ── Fake campaigns ────────────────────────────────────────────────────────
const CAMPAIGNS = [
  {
    cname:"META_P3_CONV_RT_guest_checkout_rt_ALL", aname:"META_P3_CONV_RT_guest_checkout_rt_ALL_v2",
    format:"Video", ratio:"9:16", version:"v2",
    hook:"Private sauna. No membership.", headline:"Book your session today",
    body:"Skip the gym. Book a private sauna near you — by the hour, on your schedule.",
    cta:"Book Now", lp:"/book",
    spend:45, imps:12000, clicks:320, conv:3, meta:true
  },
  {
    cname:"META_P2_CONV_PRO_guest_sauna_SEA", aname:"META_P2_CONV_PRO_guest_sauna_SEA_v1",
    format:"Image", ratio:"1:1", version:"v1",
    hook:"Seattle's first peer-to-peer sauna marketplace", headline:"Private wellness near you",
    body:"Find and book private saunas, cold plunges, and hot tubs by the hour.",
    cta:"Learn More", lp:"/seattle",
    spend:30, imps:8500, clicks:180, conv:1, meta:true
  },
  {
    cname:"META_P1_AWARE_PRO_host_earn_ALL", aname:"META_P1_AWARE_PRO_host_earn_ALL_v1",
    format:"Video", ratio:"9:16", version:"v1",
    hook:"Your sauna is sitting empty", headline:"Earn from your wellness space",
    body:"List your sauna, hot tub, or cold plunge on thrml and earn while you sleep.",
    cta:"List Your Space", lp:"/become-a-host",
    spend:20, imps:22000, clicks:95, conv:0, meta:true
  },
  {
    cname:"GOOG_P2_TRAF_PRO_guest_booking_SEA", aname:"GOOG_P2_TRAF_PRO_guest_booking_SEA_v1",
    format:"RSA", ratio:"Text", version:"v1",
    hook:"Private Sauna Rental Seattle", headline:"Book by the Hour | thrml",
    body:"Find private saunas, hot tubs & cold plunges near you. Book instantly.",
    cta:"Book Now", lp:"/search?city=seattle",
    spend:38, imps:5200, clicks:410, conv:2, meta:false
  },
  {
    cname:"GOOG_P3_CONV_RT_guest_sauna_ALL", aname:"GOOG_P3_CONV_RT_guest_sauna_ALL_v2",
    format:"RSA", ratio:"Text", version:"v2",
    hook:"You Viewed Private Saunas", headline:"Complete Your Booking | thrml",
    body:"Private wellness spaces available now. No membership required.",
    cta:"Book Now", lp:"/book",
    spend:22, imps:3800, clicks:290, conv:2, meta:false
  },
]

function generateRows() {
  const rows = []
  const today = new Date()
  for (let d=6; d>=0; d--) {
    const date = new Date(today); date.setDate(date.getDate()-d)
    const ds = date.toISOString().slice(0,10)
    for (const c of CAMPAIGNS) {
      const p = parseName(c.cname)
      const spend = jitter(c.spend), imps = Math.round(jitter(c.imps))
      const clicks = Math.round(jitter(c.clicks))
      const purch = Math.max(0, Math.round(jitter(c.conv,0.8)))
      const rev = purch * jitter(39.90, 0.1)
      const v3s = c.meta ? Math.round(imps*jitter(0.12,0.3)) : 0
      const v50 = c.meta ? Math.round(v3s*jitter(0.55,0.2)) : 0
      const v100= c.meta ? Math.round(v50*jitter(0.45,0.2)) : 0
      rows.push([
        ds, p.platform,
        `camp_${c.cname.slice(0,10)}`, `adset_${c.cname.slice(5,14)}`, `ad_${c.aname.slice(0,14)}`,
        c.cname, c.cname, c.aname,
        p.phase, p.objective, p.funnelStage, p.audience, p.concept, p.market,
        c.format, c.ratio, c.version, c.hook, c.headline, c.body, c.cta, c.lp,
        fmt(spend), String(imps), String(clicks), String(purch), fmt(rev),
        String(v3s), String(v50), String(v100),
      ])
    }
  }
  return rows
}

// ── Fixed costs ───────────────────────────────────────────────────────────
const FC_HEADERS = ["Item", "Category", "Monthly ($)", "Annual ($)", "Notes"]
const FC_ROWS = [
  ["Redis",            "Infrastructure", "7.00",   "84.00",    "Upstash/RedisLabs"],
  ["Resend Starter",   "Infrastructure", "20.00",  "240.00",   "Transactional email"],
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

// ── Ad hoc costs ──────────────────────────────────────────────────────────
const AH_HEADERS = ["Date", "Item", "Category", "Amount ($)", "Notes", "Month"]
const todayStr = new Date().toISOString().slice(0,10)
const monthStr = new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"})
const AH_SAMPLE = [
  [todayStr, "Anthropic API",         "AI",       "4.20",  "Claude API — check dashboard monthly",   monthStr],
  [todayStr, "Stripe Processing Fees","Payment",  "2.87",  "2.9%+$0.30 on bookings this week",       monthStr],
  [todayStr, "Stock photo",           "Creative", "15.00", "One-off asset purchase",                  monthStr],
]

// ── Overview builder ──────────────────────────────────────────────────────
function buildOverview(rows) {
  const today = new Date()
  const agg = (filter) => {
    let spend=0,imps=0,clicks=0,purch=0,rev=0
    for (const r of rows) {
      if (!filter(r)) continue
      spend+=parseFloat(r[22]||0); imps+=parseInt(r[23]||0)
      clicks+=parseInt(r[24]||0); purch+=parseInt(r[25]||0); rev+=parseFloat(r[26]||0)
    }
    return {spend,imps,clicks,purch,rev}
  }

  const total   = agg(()=>true)
  const meta    = agg(r=>r[1]==="Meta")
  const google  = agg(r=>r[1]==="Google")
  const prosp   = agg(r=>r[10]==="Prospecting")
  const retarg  = agg(r=>r[10]==="Retargeting")
  const guest   = agg(r=>r[11]==="Guest")
  const host    = agg(r=>r[11]==="Host")

  const fixedMonthly=109.67, days=7
  const estOpex = fixedMonthly/30*days
  const profit  = total.rev - total.spend - estOpex

  const row = (label,d) => [label, `$${fmt(d.spend)}`, String(d.imps), String(d.clicks), String(d.purch), `$${fmt(d.rev)}`]
  const sec = (title) => ["", "", "", "", "", ""]

  // Campaign-level aggregation
  const byCamp = {}
  for (const r of rows) {
    const k = r[5]; if (!k) continue
    if (!byCamp[k]) byCamp[k] = {spend:0,imps:0,clicks:0,purch:0,rev:0}
    byCamp[k].spend+=parseFloat(r[22]||0); byCamp[k].imps+=parseInt(r[23]||0)
    byCamp[k].clicks+=parseInt(r[24]||0); byCamp[k].purch+=parseInt(r[25]||0); byCamp[k].rev+=parseFloat(r[26]||0)
  }
  // Ad set level (using adset name)
  const byAdset = {}
  for (const r of rows) {
    const k = r[6]; if (!k) continue
    if (!byAdset[k]) byAdset[k] = {spend:0,imps:0,clicks:0,purch:0,rev:0}
    byAdset[k].spend+=parseFloat(r[22]||0); byAdset[k].imps+=parseInt(r[23]||0)
    byAdset[k].clicks+=parseInt(r[24]||0); byAdset[k].purch+=parseInt(r[25]||0); byAdset[k].rev+=parseFloat(r[26]||0)
  }
  // Ad level
  const byAd = {}
  for (const r of rows) {
    const k = r[7]; if (!k) continue
    if (!byAd[k]) byAd[k] = {spend:0,imps:0,clicks:0,purch:0,rev:0}
    byAd[k].spend+=parseFloat(r[22]||0); byAd[k].imps+=parseInt(r[23]||0)
    byAd[k].clicks+=parseInt(r[24]||0); byAd[k].purch+=parseInt(r[25]||0); byAd[k].rev+=parseFloat(r[26]||0)
  }

  const COL_H = ["", "Spend ($)", "Impressions", "Clicks", "Purchases", "Revenue ($)"]

  return [
    // Title
    ["thrml Platform Performance Overview — Last 7 Days","","","","",""],
    [`As of: ${today.toDateString()}  |  Period: ${new Date(today.getTime()-6*86400000).toISOString().slice(0,10)} → ${today.toISOString().slice(0,10)}`,"","","","",""],
    [""],

    // P&L
    ["💰  P&L SUMMARY","7-Day","Monthly Est.","","",""],
    ["Total Ad Spend",         `$${fmt(total.spend)}`,     `$${fmt(total.spend/days*30)}`, "","",""],
    ["Platform Revenue (5%)",  `$${fmt(total.rev)}`,       `$${fmt(total.rev/days*30)}`,   "","",""],
    ["Gross Booking Value",    `$${fmt(total.rev/0.05)}`,  `$${fmt(total.rev/0.05/days*30)}`,"","",""],
    ["Fixed OpEx (est.)",     `-$${fmt(estOpex)}`,         `-$${fmt(fixedMonthly)}`,        "","",""],
    ["Gross Profit",           `$${fmt(profit)}`,          `$${fmt(profit/days*30)}`,       "","",""],
    ["Profit Margin",          `${fmt(profit/Math.max(total.rev,0.01)*100)}%`, "","","",""],
    [""],

    // By Platform
    ["📊  BY PLATFORM", ...COL_H.slice(1)],
    row("Meta",   meta),
    row("Google", google),
    row("TOTAL",  total),
    [""],

    // By Funnel Stage
    ["🎯  BY FUNNEL STAGE", ...COL_H.slice(1)],
    row("Prospecting", prosp),
    row("Retargeting", retarg),
    [""],

    // By Audience
    ["👥  BY AUDIENCE", ...COL_H.slice(1)],
    row("Guest", guest),
    row("Host",  host),
    [""],

    // By Campaign
    ["📋  BY CAMPAIGN", ...COL_H.slice(1)],
    ...Object.entries(byCamp).map(([k,d]) => row(k,d)),
    [""],

    // By Ad Set
    ["📋  BY AD SET", ...COL_H.slice(1)],
    ...Object.entries(byAdset).map(([k,d]) => row(k,d)),
    [""],

    // By Ad
    ["🎨  BY AD", ...COL_H.slice(1)],
    ...Object.entries(byAd).map(([k,d]) => row(k,d)),
    [""],
    ["* Calculated metrics (CTR, CPC, ROAS, CPA) excluded — available in raw platform exports","","","","",""],
  ]
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🛠  thrml Master Report — Full Rebuild\n")
  const s = sheets

  // Get existing tabs
  const meta = await s.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabMap = {}
  meta.data.sheets.forEach(t => { tabMap[t.properties.title] = t.properties.sheetId })
  console.log("Existing:", Object.keys(tabMap).join(", "))

  // Create required tabs
  const required = ["Fixed Costs", "Ad Hoc Costs", "Platform Data", "Overview"]
  const toCreate = required.filter(t => !tabMap[t])
  if (toCreate.length) {
    const res = await s.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID,
      requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) }
    })
    res.data.replies.forEach((r,i) => { tabMap[toCreate[i]] = r.addSheet.properties.sheetId })
    console.log("Created:", toCreate.join(", "))
  }

  // Delete stale tabs
  const stale = ["Sheet1","Summary"].filter(t => tabMap[t] !== undefined)
  if (stale.length) {
    await s.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID,
      requestBody: { requests: stale.map(t => ({ deleteSheet: { sheetId: tabMap[t] } })) }
    }).catch(()=>{})
    console.log("Removed:", stale.join(", "))
  }

  const rows = generateRows()

  // 1. Fixed Costs
  await s.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "Fixed Costs!A1",
    valueInputOption: "RAW", requestBody: { values: [FC_HEADERS, ...FC_ROWS] } })
  console.log("✅ Fixed Costs")

  // 2. Ad Hoc Costs
  await s.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "Ad Hoc Costs!A1",
    valueInputOption: "RAW", requestBody: { values: [
      ["⬇ Add variable or one-time costs below. Month column groups MTD totals automatically.","","","","",""],
      AH_HEADERS, ...AH_SAMPLE,
    ]}
  })
  console.log("✅ Ad Hoc Costs")

  // 3. Platform Data
  await s.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "Platform Data!A1",
    valueInputOption: "RAW", requestBody: { values: [PLATFORM_DATA_HEADERS, ...rows] } })
  console.log(`✅ Platform Data — ${rows.length} rows`)

  // 4. Overview
  await s.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "Overview!A1",
    valueInputOption: "RAW", requestBody: { values: buildOverview(rows) } })
  console.log("✅ Overview")

  // Formatting
  console.log("\n🎨 Formatting...")
  const dark  = {red:0.102,green:0.078,blue:0.063}
  const white = {red:1,green:1,blue:1}
  const gray  = {red:0.93,green:0.93,blue:0.93}
  const pd=tabMap["Platform Data"], fc=tabMap["Fixed Costs"]
  const ah=tabMap["Ad Hoc Costs"],  ov=tabMap["Overview"]

  const hdr = (sid,row,cols,bg,fg) => ({ repeatCell: {
    range:{sheetId:sid,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:cols},
    cell:{userEnteredFormat:{backgroundColor:bg,textFormat:{foregroundColor:fg,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}},
    fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
  }})
  const freeze = (sid,n) => ({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:n}},fields:"gridProperties.frozenRowCount"}})
  const cw = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})

  await s.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
    // Platform Data
    freeze(pd,1), hdr(pd,0,PLATFORM_DATA_HEADERS.length,dark,white),
    cw(pd,0,1,90), cw(pd,1,2,65), cw(pd,2,5,155), cw(pd,5,8,230),
    cw(pd,8,9,55), cw(pd,9,10,120), cw(pd,10,11,110), cw(pd,11,12,80),
    cw(pd,12,13,120), cw(pd,13,14,80),
    cw(pd,14,15,80), cw(pd,15,16,80), cw(pd,16,17,65),
    cw(pd,17,18,200), cw(pd,18,19,170), cw(pd,19,20,200), cw(pd,20,21,90), cw(pd,21,22,130),
    cw(pd,22,30,80),

    // Fixed Costs
    freeze(fc,1), hdr(fc,0,5,dark,white),
    cw(fc,0,1,190), cw(fc,1,2,120), cw(fc,2,4,100), cw(fc,4,5,250),

    // Ad Hoc
    freeze(ah,2), hdr(ah,0,6,gray,dark), hdr(ah,1,6,dark,white),
    cw(ah,0,1,100), cw(ah,1,2,190), cw(ah,2,3,120), cw(ah,3,4,95), cw(ah,4,5,220), cw(ah,5,6,100),

    // Overview
    freeze(ov,2),
    {repeatCell:{range:{sheetId:ov,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:6},
      cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true,fontSize:13},padding:{top:10,bottom:10}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,padding)"}},
    cw(ov,0,1,300), cw(ov,1,6,120),
  ]}})
  console.log("✅ Formatting applied")
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
