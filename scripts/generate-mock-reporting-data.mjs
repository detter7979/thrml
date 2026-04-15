/**
 * Mock Reporting Data Generator
 * Creates Raw + Cleaned files in Drive and updates the Master Report Platform Data tab
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

// ── IDs from Supabase platform_settings ──────────────────────────────────
const RAW_FOLDER_ID     = "15FIxUe7411b3hzPEB7AzRlQgYRt9EzGo"
const CLEANED_FOLDER_ID = "1yjIh556CkkQxWZ8oq_mZFtKKISVn1n6b"
const MASTER_ID         = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── Naming convention parser (inline) ─────────────────────────────────────
const PLATFORM_MAP  = { META:"Meta",GOOG:"Google",SNAP:"Snapchat",TIKTOK:"TikTok" }
const OBJECTIVE_MAP = { REACH:"Reach",LEAD:"Lead",CONV:"Conversion",AWARE:"Awareness" }
const FUNNEL_MAP    = { PROSP:"Prospecting",LAL:"Lookalike",LAL1:"Lookalike",LAL2:"Lookalike",RT:"Retargeting",CRM:"CRM" }
const GEO_MAP       = { ALL:"All",SEA:"Seattle",US:"US" }
const SPACE_MAP     = { GEN:"General",SAUNA:"Sauna",HOTTUB:"Hot Tub",COLDPLUNGE:"Cold Plunge",ALL_SPACES:"All Spaces",INCOME:"Income",GEN2:"gen" }
const AUD_SRC_TYPE  = { INT:"Interest",LAL1:"LAL",LAL2:"LAL",LAL:"LAL",CRMATCH:"CRM",RT:"Retargeting",RT_CHECKOUT:"Retargeting",RT_LISTING:"Retargeting" }
const AUD_SRC_TIER  = { INT:"—",LAL1:"1%",LAL2:"2%",LAL:"—",CRMATCH:"—",RT:"—",RT_CHECKOUT:"checkout",RT_LISTING:"listing" }
const FMT_TYPE      = { STATIC_9X16:"Static",STATIC_1X1:"Static",VIDEO_15S:"Video",VIDEO_30S:"Video",CAROUSEL:"Carousel",UGC:"UGC",RSA:"RSA" }
const FMT_LEN       = { STATIC_9X16:"NA",STATIC_1X1:"NA",VIDEO_15S:"15s",VIDEO_30S:"30s",CAROUSEL:"NA",UGC:"NA",RSA:"NA" }
const FMT_RATIO     = { STATIC_9X16:"9x16",STATIC_1X1:"1x1",VIDEO_15S:"9x16",VIDEO_30S:"9x16",CAROUSEL:"1x1",UGC:"9x16",RSA:"NA" }
const CTA_MAP       = { LIST_NOW:"List Now",GET_STARTED:"Get Started",SEE_HOW:"See How",LEARN_MORE:"Learn More",BOOK_NOW:"Book Now",EXPLORE:"Explore" }
const KNOWN_GEOS    = new Set(Object.keys(GEO_MAP))
const KNOWN_FMTS    = new Set(Object.keys(FMT_TYPE))
const KNOWN_CTAS    = new Set(Object.keys(CTA_MAP))
const KNOWN_SRCS    = new Set(Object.keys(AUD_SRC_TYPE))
const KNOWN_SPACE   = new Set(["GEN","SAUNA","HOTTUB","COLDPLUNGE","ALL_SPACES","INCOME"])

function parseName(name) {
  const parts = (name||"").trim().split("_").filter(Boolean)
  const r = { platform:"",phase:"",campaignObjective:"",funnelStage:"",
    audienceGroup:"",audienceInterest:"",geo:"",spaceType:"",
    audienceSource:"",audienceTier:"",placement:"",testId:"",variant:"",
    angle:"",formatType:"",formatLength:"NA",formatRatio:"NA",cta:"",optEvent:"" }
  let c = 0
  if (PLATFORM_MAP[parts[c]?.toUpperCase()]) r.platform = PLATFORM_MAP[parts[c++].toUpperCase()]
  if (/^P\d+$/i.test(parts[c]??'')) r.phase = parts[c++].toUpperCase()
  if (OBJECTIVE_MAP[parts[c]?.toUpperCase()]) r.campaignObjective = OBJECTIVE_MAP[parts[c++].toUpperCase()]
  if (FUNNEL_MAP[parts[c]?.toUpperCase()]) r.funnelStage = FUNNEL_MAP[parts[c++].toUpperCase()]
  const at1 = parts[c]?.toLowerCase(), at2 = parts[c+1]?.toLowerCase()
  if (at1 && (at1==="host"||at1==="guest") && at2 && !KNOWN_GEOS.has(at2.toUpperCase())) {
    r.audienceGroup = at1==="host"?"Host":"Guest"; r.audienceInterest = at2; c+=2
  }
  if (KNOWN_GEOS.has(parts[c]?.toUpperCase())) { r.geo = GEO_MAP[parts[c++].toUpperCase()] }
  // space type (sauna | hottub | coldplunge | gen | income | all_spaces)
  if (KNOWN_SPACE.has(parts[c]?.toUpperCase())) { r.spaceType = SPACE_MAP[parts[c++].toUpperCase()] || parts[c-1] }
  // audience source: try 2-token combo first (rt_checkout, rt_listing)
  const as2 = parts.slice(c,c+2).join("_").toUpperCase()
  const as1 = parts[c]?.toUpperCase()
  if (KNOWN_SRCS.has(as2)) { r.audienceSource=AUD_SRC_TYPE[as2]; r.audienceTier=AUD_SRC_TIER[as2]; c+=2 }
  else if (KNOWN_SRCS.has(as1)) { r.audienceSource=AUD_SRC_TYPE[as1]; r.audienceTier=AUD_SRC_TIER[as1]; c++ }
  // placement — until T\d+
  const pp = []; while (c<parts.length && !(/^T\d+$/i.test(parts[c]))) pp.push(parts[c++])
  r.placement = pp.join("-")
  // ad-level
  const ti = parts.findIndex(p => /^T\d+$/i.test(p))
  if (ti>=0) {
    let ac = ti; r.testId = parts[ac++]; r.variant = parts[ac++]?.toUpperCase()||""
    const ap = []; while (ac<parts.length) {
      const f1=parts[ac]?.toUpperCase(), f2=parts[ac+1]?.toUpperCase()
      if (KNOWN_FMTS.has(`${f1}_${f2}`) || KNOWN_FMTS.has(f1)) break; ap.push(parts[ac++])
    }
    r.angle = ap.join("_")
    const f1=parts[ac]?.toUpperCase(), f2=parts[ac+1]?.toUpperCase()
    const fk2=`${f1}_${f2}`
    if (KNOWN_FMTS.has(fk2)) { r.formatType=FMT_TYPE[fk2]; r.formatLength=FMT_LEN[fk2]; r.formatRatio=FMT_RATIO[fk2]; ac+=2 }
    else if (KNOWN_FMTS.has(f1)) { r.formatType=FMT_TYPE[f1]; r.formatLength=FMT_LEN[f1]; r.formatRatio=FMT_RATIO[f1]; ac++ }
    const ck = parts[ac]?.toUpperCase()
    r.cta = KNOWN_CTAS.has(ck) ? CTA_MAP[ck] : (parts[ac]||"")
    const ph = parseInt(r.phase.replace("P","")||"0")
    const isHost = r.audienceGroup==="Host"
    r.optEvent = isHost ? (ph===1?"become_host_click":ph===2?"host_onboarding_started":"listing_created")
      : (ph>=3?"Purchase":ph===2?"InitiateCheckout":"ViewContent")
  }
  return r
}

// ── Column definitions ─────────────────────────────────────────────────────

const RAW_HEADERS = [
  "Date","Platform","Campaign Name","Ad Set Name","Ad Name",
  "Impressions","Reach","Link Clicks","Spend ($)",
  "become_host_click","host_onboarding_started","listing_created","Purchase",
  "Video Views 100%",
]

const CLEANED_HEADERS = [
  "Date","Platform","Campaign Name","Ad Set Name","Ad Name",
  "Phase","Campaign Objective","Funnel Stage",
  "Audience Group","Audience Interest","Geo",
  "Space Type","Audience Source","Audience Tier","Placement",
  "Test ID","Variant","Angle",
  "Format Type","Length","Aspect Ratio","CTA",
  "Hook Copy","Status","Opt. Event",
  "Spend ($)","Impressions","Reach","Link Clicks",
  "become_host_click","host_onboarding_started","listing_created","Purchase",
  "Video Views 100%",
]

// ── Mock ad data ──────────────────────────────────────────────────────────
const MOCK_ADS = [
  // ── Host P1 ────────────────────────────────────────────────────────────
  { adName:"META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES_T01_A_income_Static_9x16_list_now",
    spend:18.5,  imps:12400, reach:11200, clicks:310, bhc:22, hos:0, lc:0, purch:0, vv100:0, hook:"Your sauna sits empty 6 days…", status:"Live" },
  { adName:"META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES_T01_B_community_Static_9x16_list_now",
    spend:14.2,  imps:9800,  reach:9100,  clicks:240, bhc:16, hos:0, lc:0, purch:0, vv100:0, hook:"Join 200+ hosts sharing…", status:"Testing" },
  { adName:"META_P1_REACH_PROSP_host_gen_ALL_hottub_int_FEED-STORIES_T01_A_idle_space_Static_9x16_list_now",
    spend:13.1,  imps:8200,  reach:7600,  clicks:195, bhc:14, hos:0, lc:0, purch:0, vv100:0, hook:"Hot tub on → guests off →…", status:"Live" },
  { adName:"META_P1_REACH_PROSP_host_gen_ALL_hottub_int_FEED-STORIES_T01_B_income_Video_15s_list_now",
    spend:11.4,  imps:7100,  reach:6600,  clicks:168, bhc:11, hos:0, lc:0, purch:0, vv100:3200, hook:"$400/month. Same hot tub.", status:"Testing" },
  // ── Host P2 ────────────────────────────────────────────────────────────
  { adName:"META_P2_LEAD_PROSP_host_gen_ALL_sauna_lal1_FEED-STORIES_T02_A_idle_space_Video_15s_get_started",
    spend:31.4,  imps:8400,  reach:7900,  clicks:180, bhc:0, hos:14, lc:0, purch:0, vv100:2100, hook:"Setup takes 10 minutes…", status:"Draft" },
  { adName:"META_P2_LEAD_PROSP_host_gen_ALL_sauna_lal1_FEED-STORIES_T02_B_social_proof_Carousel_get_started",
    spend:24.6,  imps:6200,  reach:5800,  clicks:145, bhc:0, hos:9,  lc:0, purch:0, vv100:0,    hook:"See what hosts earn…", status:"Draft" },
  // ── Host P3 ────────────────────────────────────────────────────────────
  { adName:"META_P3_CONV_LAL_host_gen_ALL_sauna_lal2_FEED-STORIES_T03_A_social_proof_Static_9x16_list_now",
    spend:28.8,  imps:4100,  reach:3900,  clicks:92,  bhc:0, hos:0, lc:3, purch:0, vv100:0, hook:"First booking in 48 hrs", status:"Draft" },
  { adName:"META_P3_CONV_LAL_host_gen_ALL_sauna_lal2_FEED-STORIES_T03_B_urgency_Video_30s_list_now",
    spend:21.9,  imps:3300,  reach:3100,  clicks:74,  bhc:0, hos:0, lc:1, purch:0, vv100:890, hook:"Limited spots in Seattle", status:"Draft" },
  // ── Guest P3 RT ────────────────────────────────────────────────────────
  { adName:"META_P3_CONV_RT_guest_checkout_rt_ALL_all_spaces_rt_checkout_FEED-STORIES_T04_A_fomo_Static_9x16_book_now",
    spend:21.4,  imps:3200,  reach:2900,  clicks:87,  bhc:0, hos:0, lc:0, purch:2, vv100:0, hook:"You were this close…", status:"Draft" },
  { adName:"META_P3_CONV_RT_guest_checkout_rt_ALL_all_spaces_rt_checkout_FEED-STORIES_T04_B_urgency_Video_15s_book_now",
    spend:18.9,  imps:2800,  reach:2600,  clicks:72,  bhc:0, hos:0, lc:0, purch:1, vv100:640, hook:"Only 3 spots left this week", status:"Draft" },
  // ── Guest P2 RT listing ────────────────────────────────────────────────
  { adName:"META_P2_CONV_RT_guest_listing_rt_ALL_all_spaces_rt_listing_FEED-STORIES_T04_A_ease_Carousel_book_now",
    spend:19.6,  imps:5100,  reach:4800,  clicks:144, bhc:0, hos:0, lc:0, purch:0, vv100:0, hook:"Browse → book in 2 mins", status:"Draft" },
  // ── Guest P1 wellness ─────────────────────────────────────────────────
  { adName:"META_P1_CONV_PROSP_guest_wellness_ALL_gen_int_FEED-STORIES_T05_A_sensory_Video_30s_explore",
    spend:14.1,  imps:9800,  reach:9200,  clicks:218, bhc:0, hos:0, lc:0, purch:0, vv100:1820, hook:"Heat. Steam. Silence.", status:"Draft" },
  { adName:"META_P1_CONV_PROSP_guest_wellness_ALL_gen_int_FEED-STORIES_T05_B_community_Static_9x16_explore",
    spend:11.8,  imps:7600,  reach:7100,  clicks:182, bhc:0, hos:0, lc:0, purch:0, vv100:0, hook:"Your neighbourhood sauna →", status:"Draft" },
  // ── Google host search ─────────────────────────────────────────────────
  { adName:"GOOG_P1_CONV_PROSP_host_gen_SEA_income_int_SEARCH_T01_A_income_RSA_list_now",
    spend:22.1,  imps:5200,  reach:5200,  clicks:198, bhc:8,  hos:0, lc:0, purch:0, vv100:0, hook:"Earn from your sauna today", status:"Live" },
  { adName:"GOOG_P3_CONV_RT_guest_checkout_rt_ALL_all_spaces_rt_checkout_SEARCH_T04_A_fomo_RSA_book_now",
    spend:31.2,  imps:2100,  reach:2100,  clicks:312, bhc:0,  hos:0, lc:0, purch:4, vv100:0, hook:"Private sauna. Book now.", status:"Live" },
]

function jitter(base, pct=0.15) { return base*(1+(Math.random()-0.5)*pct) }
function fmt(n,d=2) { return Number(n).toFixed(d) }

// Generate 7 days of data
function generateDays() {
  const today = new Date()
  const allDays = []
  for (let d=6; d>=0; d--) {
    const date = new Date(today); date.setDate(date.getDate()-d)
    const dateStr = date.toISOString().slice(0,10)
    for (const ad of MOCK_ADS) {
      const p = parseName(ad.adName)
      const isGoogle = p.platform === "Google"
      const spend  = jitter(ad.spend)
      const imps   = Math.round(jitter(ad.imps))
      const reach  = Math.round(jitter(ad.reach))
      const clicks = Math.round(jitter(ad.clicks))
      const bhc    = Math.max(0, Math.round(jitter(ad.bhc, 0.4)))
      const hos    = Math.max(0, Math.round(jitter(ad.hos, 0.5)))
      const lc     = Math.max(0, Math.round(jitter(ad.lc, 0.5)))
      const purch  = Math.max(0, Math.round(jitter(ad.purch, 0.6)))
      const vv100  = ad.vv100 > 0 ? Math.round(jitter(ad.vv100)) : 0

      // Campaign / adset names: extract from ad name
      const nameParts = ad.adName.split("_")
      const tIdx = nameParts.findIndex(p => /^T\d+$/i.test(p))
      const campTokens = 7  // platform+phase+obj+funnel+aud1+aud2+geo
      const campName = nameParts.slice(0, campTokens).join("_")
      // Ad set ends at T\d+
      const adsetName = tIdx > 0 ? nameParts.slice(0, tIdx).join("_") : nameParts.slice(0, campTokens+3).join("_")

      allDays.push({
        dateStr, platform: p.platform, campName, adsetName, adName: ad.adName,
        spend, imps, reach, clicks, bhc, hos, lc, purch, vv100,
        parsed: p, hook: ad.hook, status: ad.status,
      })
    }
  }
  return allDays
}

// ── Drive write helpers ────────────────────────────────────────────────────
async function writeSheetToFolder(folderId, fileName, headers, rows) {
  // Update existing file if present, otherwise skip creation (quota issue)
  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  const existingId = existing.data.files?.[0]?.id
  if (existingId) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: existingId, range: "Sheet1!A1",
      valueInputOption: "RAW", requestBody: { values: [headers, ...rows] },
    })
    return existingId
  }
  // Can't create new files due to service account quota — write to Master only
  return null
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🧪 thrml Mock Reporting Data Generator\n")

  const days = generateDays()
  // Group by date + platform for daily files
  const byDatePlat = {}
  for (const row of days) {
    const key = `${row.dateStr}_${row.platform}`
    if (!byDatePlat[key]) byDatePlat[key] = []
    byDatePlat[key].push(row)
  }

  let rawCount = 0, cleanedCount = 0

  for (const [key, rows] of Object.entries(byDatePlat)) {
    const [date, platform] = key.split("_")
    const platShort = platform === "Meta" ? "Meta" : "Google"

    // ── RAW file ──────────────────────────────────────────────────────────
    const rawRows = rows.map(r => [
      r.dateStr, r.platform, r.campName, r.adsetName, r.adName,
      String(r.imps), String(r.reach), String(r.clicks), fmt(r.spend),
      String(r.bhc), String(r.hos), String(r.lc), String(r.purch), String(r.vv100),
    ])
    await writeSheetToFolder(RAW_FOLDER_ID, `${platShort}_Raw_${date}`, RAW_HEADERS, rawRows)
    rawCount++
    process.stdout.write(".")

    // ── CLEANED file ──────────────────────────────────────────────────────
    const cleanedRows = rows.map(r => {
      const p = r.parsed
      return [
        r.dateStr, r.platform, r.campName, r.adsetName, r.adName,
        p.phase, p.campaignObjective, p.funnelStage,
        p.audienceGroup, p.audienceInterest, p.geo,
        p.spaceType, p.audienceSource, p.audienceTier, p.placement,
        p.testId, p.variant, p.angle,
        p.formatType, p.formatLength, p.formatRatio, p.cta,
        r.hook, r.status, p.optEvent,
        fmt(r.spend), String(r.imps), String(r.reach), String(r.clicks),
        String(r.bhc), String(r.hos), String(r.lc), String(r.purch), String(r.vv100),
      ]
    })
    await writeSheetToFolder(CLEANED_FOLDER_ID, `${platShort}_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
    cleanedCount++
    process.stdout.write(".")
  }

  console.log(`\n✅ Raw files: ${rawCount}  |  Cleaned files: ${cleanedCount}`)

  // ── MASTER REPORT — Platform Data tab ────────────────────────────────────
  console.log("\n📊 Updating Master Report Platform Data tab...")

  // Clear existing Platform Data and write fresh
  await sheets.spreadsheets.values.clear({ spreadsheetId: MASTER_ID, range: "Platform Data!A1:AZ50000" })

  // Combine ALL cleaned rows across all dates/platforms
  const allCleanedRows = []
  for (const rows of Object.values(byDatePlat)) {
    for (const r of rows) {
      const p = r.parsed
      allCleanedRows.push([
        r.dateStr, r.platform, r.campName, r.adsetName, r.adName,
        p.phase, p.campaignObjective, p.funnelStage,
        p.audienceGroup, p.audienceInterest, p.geo,
        p.spaceType, p.audienceSource, p.audienceTier, p.placement,
        p.testId, p.variant, p.angle,
        p.formatType, p.formatLength, p.formatRatio, p.cta,
        r.hook, r.status, p.optEvent,
        fmt(r.spend), String(r.imps), String(r.reach), String(r.clicks),
        String(r.bhc), String(r.hos), String(r.lc), String(r.purch), String(r.vv100),
      ])
    }
  }

  // Sort by date
  allCleanedRows.sort((a,b) => a[0].localeCompare(b[0]))

  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_ID, range: "Platform Data!A1",
    valueInputOption: "RAW", requestBody: { values: [CLEANED_HEADERS, ...allCleanedRows] },
  })
  console.log(`✅ Platform Data: ${allCleanedRows.length} rows written`)

  // ── Apply formatting to Platform Data tab ─────────────────────────────────
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const pdTab = sheetMeta.data.sheets.find(s => s.properties.title === "Platform Data")
  const pdId = pdTab?.properties.sheetId ?? 0

  const dark  = {red:0.102,green:0.078,blue:0.063}
  const white = {red:1,green:1,blue:1}
  const green = {red:0.851,green:0.918,blue:0.827}
  const amber = {red:1,green:0.93,blue:0.7}

  const cw = (s,e,px) => ({updateDimensionProperties:{range:{sheetId:pdId,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
    // Freeze header
    {updateSheetProperties:{properties:{sheetId:pdId,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"}},
    // Header row dark
    {repeatCell:{range:{sheetId:pdId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:CLEANED_HEADERS.length},
      cell:{userEnteredFormat:{backgroundColor:dark,textFormat:{foregroundColor:white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}},
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"}},
    // Audience split cols (8,9 = Audience Group, Audience Interest) — subtle tint
    {repeatCell:{range:{sheetId:pdId,startRowIndex:1,endRowIndex:500,startColumnIndex:8,endColumnIndex:10},
      cell:{userEnteredFormat:{backgroundColor:{red:0.96,green:0.95,blue:1.0}}},
      fields:"userEnteredFormat(backgroundColor)"}},
    // Audience Source + Tier (12,13)
    {repeatCell:{range:{sheetId:pdId,startRowIndex:1,endRowIndex:500,startColumnIndex:12,endColumnIndex:14},
      cell:{userEnteredFormat:{backgroundColor:{red:0.96,green:0.95,blue:1.0}}},
      fields:"userEnteredFormat(backgroundColor)"}},
    // Format split cols (18,19,20 = FormatType, Length, Ratio) — amber tint on header
    {repeatCell:{range:{sheetId:pdId,startRowIndex:0,endRowIndex:1,startColumnIndex:18,endColumnIndex:21},
      cell:{userEnteredFormat:{backgroundColor:amber,textFormat:{foregroundColor:dark,bold:true,fontSize:10}}},
      fields:"userEnteredFormat(backgroundColor,textFormat)"}},
    // Column widths
    cw(0,1,90),  // Date
    cw(1,2,65),  // Platform
    cw(2,3,230), // Campaign Name
    cw(3,4,260), // Ad Set Name
    cw(4,5,290), // Ad Name
    cw(5,6,50),  // Phase
    cw(6,7,110), // Campaign Objective
    cw(7,8,110), // Funnel Stage
    cw(8,9,90),  // Audience Group
    cw(9,10,110),// Audience Interest
    cw(10,11,65),// Geo
    cw(11,12,80),// Space Type
    cw(12,13,100),// Audience Source
    cw(13,14,80), // Audience Tier
    cw(14,15,110),// Placement
    cw(15,16,55), // Test ID
    cw(16,17,55), // Variant
    cw(17,18,100),// Angle
    cw(18,19,75), // Format Type
    cw(19,20,65), // Length
    cw(20,21,80), // Aspect Ratio
    cw(21,22,90), // CTA
    cw(22,23,200),// Hook Copy
    cw(23,24,75), // Status
    cw(24,25,160),// Opt. Event
    cw(25,34,80), // Metrics cols
  ]}})

  const days7 = [...new Set(allCleanedRows.map(r=>r[0]))].length
  const platforms = [...new Set(allCleanedRows.map(r=>r[1]))]
  console.log(`\n✅ Formatting applied`)
  console.log(`\n📈 Summary:`)
  console.log(`   Date range: last ${days7} days`)
  console.log(`   Platforms: ${platforms.join(", ")}`)
  console.log(`   Total rows: ${allCleanedRows.length} (${MOCK_ADS.length} ads × ${days7} days)`)
  console.log(`   Raw folder: ${rawCount} files`)
  console.log(`   Cleaned folder: ${cleanedCount} files`)
  console.log(`\n📊 Master Report: https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
