import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const ID = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

// ─── DATA ────────────────────────────────────────────────────────────────────

// Campaigns — split Audience Type + Audience Interest
// Name = {Platform}_{Phase}_{Objective}_{Funnel}_{AudType}_{AudInterest}_{Geo}
const CAMPAIGNS = [
  // ── HOST CAMPAIGNS ─────────────────────────────────────────────────────────
  ["C001","META","P1","REACH","PROSP","host","gen",   "ALL","become_host_click",    "1","Phase 1 host — broad gen interest, awareness"],
  ["C002","META","P1","REACH","PROSP","host","sauna", "ALL","become_host_click",    "1","Phase 1 host — sauna owner interest"],
  ["C003","META","P2","LEAD", "PROSP","host","gen",   "ALL","host_onboarding_started","2","Phase 2 host — PROSP, warm audiences"],
  ["C004","META","P2","LEAD", "LAL",  "host","sauna", "ALL","host_onboarding_started","2","Phase 2 host — 1% LAL expansion"],
  ["C005","META","P3","CONV", "LAL",  "host","gen",   "ALL","listing_created",      "3","Phase 3 host — 2% LAL, close to listing"],
  ["C006","META","P3","CONV", "LAL",  "host","sauna", "ALL","listing_created",      "3","Phase 3 host — 2% LAL, sauna-specific"],
  ["C007","GOOG","P1","CONV", "PROSP","host","gen",   "SEA","become_host_click",    "1","Google Search — host keywords, Seattle"],
  ["C008","GOOG","P2","CONV", "PROSP","host","gen",   "SEA","host_onboarding_started","2","Google P2 — warm host audiences"],
  ["C009","GOOG","P3","CONV", "PROSP","host","gen",   "SEA","listing_created",      "3","Google P3 — high-intent host search"],
  // ── GUEST CAMPAIGNS ────────────────────────────────────────────────────────
  ["C010","META","P3","CONV", "RT",   "guest","checkout_rt","ALL","Purchase",       "★","Priority 1 — checkout retargeting. Start here."],
  ["C011","META","P2","CONV", "RT",   "guest","listing_rt", "ALL","InitiateCheckout","2","Priority 2 — listing view retargeting"],
  ["C012","META","P1","CONV", "PROSP","guest","wellness",   "ALL","ViewContent",    "3","Priority 3 — cold wellness interest"],
  ["C013","META","P1","CONV", "PROSP","guest","biohacking", "ALL","ViewContent",    "4","Priority 4 — cold biohacking. Add when budget allows."],
  ["C014","GOOG","P3","CONV", "RT",   "guest","checkout_rt","ALL","Purchase",       "★","Google RT — /book/ visitors last 14 days"],
  ["C015","GOOG","P1","CONV", "PROSP","guest","wellness",   "SEA","ViewContent",    "3","Google Demand Gen — wellness, Seattle DMA"],
]

// Ad Sets — reference Campaign ID
// Name = {CampaignName}_{SpaceType}_{AudSrc}_{Placement}
const ADSETS = [
  // ── HOST AD SETS (C001 - META_P1_REACH_PROSP_host_gen_ALL) ────────────────
  ["AS001","C001","META_P1_REACH_PROSP_host_gen_ALL",   "sauna",    "int",       "FEED-STORIES","Nordic, Finnish, Barrel, Infrared sauna",     "become_host_click",     "35%"],
  ["AS002","C001","META_P1_REACH_PROSP_host_gen_ALL",   "hottub",   "int",       "FEED-STORIES","Hot tub, Jacuzzi, Hydrotherapy, Spa (home)",   "become_host_click",     "25%"],
  ["AS003","C001","META_P1_REACH_PROSP_host_gen_ALL",   "coldplunge","int",      "FEED-STORIES","Ice bath, Cold therapy, Wim Hof, Huberman",    "become_host_click",     "20%"],
  ["AS004","C001","META_P1_REACH_PROSP_host_gen_ALL",   "income",   "int",       "FEED-STORIES","Passive income, Airbnb host, Vacation rental", "become_host_click",     "20%"],
  // ── HOST AD SETS (C003 - META_P2_LEAD_PROSP_host_gen_ALL) ────────────────
  ["AS005","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "sauna",    "lal1",      "FEED-STORIES","1% LAL of P1 become_host_click events",        "host_onboarding_started","40%"],
  ["AS006","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "income",   "lal1",      "FEED-STORIES","1% LAL of P1 become_host_click — all types",   "host_onboarding_started","30%"],
  ["AS007","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "sauna",    "lal2",      "FEED-STORIES","2% LAL expansion — broader, lower CPM",        "host_onboarding_started","30%"],
  // ── HOST AD SETS (C005 - META_P3_CONV_LAL_host_gen_ALL) ─────────────────
  ["AS008","C005","META_P3_CONV_LAL_host_gen_ALL",      "sauna",    "lal2",      "FEED-STORIES","2% LAL of P2 host_onboarding_started events",  "listing_created",       "50%"],
  ["AS009","C005","META_P3_CONV_LAL_host_gen_ALL",      "income",   "lal2",      "FEED-STORIES","Advantage+ audiences (after 100+ P3 events)",  "listing_created",       "50%"],
  // ── HOST AD SETS (C007 - GOOG_P1_CONV_PROSP_host_gen_SEA) ───────────────
  ["AS010","C007","GOOG_P1_CONV_PROSP_host_gen_SEA",    "income",   "int",       "SEARCH",     "'sauna rental near me', 'rent sauna space'",    "become_host_click",     "100%"],
  // ── GUEST AD SETS (C010 - META_P3_CONV_RT_guest_checkout_rt_ALL) ─────────
  ["AS011","C010","META_P3_CONV_RT_guest_checkout_rt_ALL","all_spaces","rt_checkout","FEED-STORIES","RT: InitiateCheckout no Purchase, 14d. Excl: purchasers.","Purchase","40%"],
  ["AS012","C010","META_P3_CONV_RT_guest_checkout_rt_ALL","sauna",  "rt_checkout","FEED-STORIES","RT: sauna listing views, no checkout, 7d",     "Purchase",              "0% — activate when all_spaces RT freq > 3"],
  // ── GUEST AD SETS (C011 - META_P2_CONV_RT_guest_listing_rt_ALL) ──────────
  ["AS013","C011","META_P2_CONV_RT_guest_listing_rt_ALL","all_spaces","rt_listing","FEED-STORIES","RT: ViewContent any listing 7d. Excl: IC + purchasers.","InitiateCheckout","35%"],
  // ── GUEST AD SETS (C012 - META_P1_CONV_PROSP_guest_wellness_ALL) ─────────
  ["AS014","C012","META_P1_CONV_PROSP_guest_wellness_ALL","gen",    "int",       "FEED-STORIES","Wellness, yoga, spa, sauna, mindfulness, Calm","ViewContent",            "15%"],
  // ── GUEST AD SETS (C013 - META_P1_CONV_PROSP_guest_biohacking_ALL) ───────
  ["AS015","C013","META_P1_CONV_PROSP_guest_biohacking_ALL","gen",  "int",       "FEED-STORIES","Ice bath, Wim Hof, biohacking, Huberman, longevity","ViewContent",       "10%"],
  // ── GUEST AD SETS (C014 - GOOG_P3_CONV_RT_guest_checkout_rt_ALL) ─────────
  ["AS016","C014","GOOG_P3_CONV_RT_guest_checkout_rt_ALL","all_spaces","rt_checkout","SEARCH", "Google Search RT: /book/ visitors 14d. 'sauna rental'","Purchase",         "60% of Google"],
  // ── GUEST AD SETS (C015 - GOOG_P1_CONV_PROSP_guest_wellness_SEA) ─────────
  ["AS017","C015","GOOG_P1_CONV_PROSP_guest_wellness_SEA","gen",    "int",       "DEMAND-GEN", "Demand Gen: wellness audiences, Seattle DMA, GA4 LAL","ViewContent",       "40% of Google"],
]

// Creative Builder — reference Ad Set ID
// Ad Name = {AdSetName}_{TestID}_{Variant}_{Angle}_{Format}_{CTA}
const CREATIVES = [
  // ── HOST P1 — T01 (income vs community angle test) ────────────────────────
  ["AD001","AS001","C001","T01","A","income",      "Static_9x16","list_now", "Your sauna sits empty 6 days…","Live",  "META","P1","become_host_click"],
  ["AD002","AS001","C001","T01","B","community",   "Static_9x16","list_now", "Join 200+ hosts sharing…",     "Testing","META","P1","become_host_click"],
  ["AD003","AS002","C001","T01","A","idle_space",  "Static_9x16","list_now", "Hot tub on → guests off →…",   "Live",  "META","P1","become_host_click"],
  ["AD004","AS002","C001","T01","B","income",      "Video_15s",  "list_now", "$400/month. Same hot tub.",     "Testing","META","P1","become_host_click"],
  ["AD005","AS010","C007","T01","A","income",      "Static_1x1", "list_now", "Earn from your sauna today",   "Live",  "GOOG","P1","become_host_click"],
  // ── HOST P2 — T02 (idle_space vs social_proof, video vs carousel) ─────────
  ["AD006","AS005","C003","T02","A","idle_space",  "Video_15s",  "get_started","Setup takes 10 minutes…",    "Draft","META","P2","host_onboarding_started"],
  ["AD007","AS005","C003","T02","B","social_proof","Carousel",   "get_started","See what hosts earn…",        "Draft","META","P2","host_onboarding_started"],
  ["AD008","AS006","C003","T02","A","community",   "Static_9x16","get_started","Your space. Your rules.",     "Draft","META","P2","host_onboarding_started"],
  // ── HOST P3 — T03 (social_proof vs urgency) ───────────────────────────────
  ["AD009","AS008","C005","T03","A","social_proof","Static_9x16","list_now", "First booking in 48 hrs",      "Draft","META","P3","listing_created"],
  ["AD010","AS008","C005","T03","B","urgency",     "Video_30s",  "list_now", "Limited spots in Seattle",     "Draft","META","P3","listing_created"],
  ["AD011","AS009","C005","T03","A","social_proof","UGC",        "list_now", "I listed mine last week…",     "Draft","META","P3","listing_created"],
  // ── GUEST P3 CHECKOUT RT — T04 (fomo vs urgency vs social_proof) ──────────
  ["AD012","AS011","C010","T04","A","fomo",        "Static_9x16","book_now", "You were this close…",         "Draft","META","P3","Purchase"],
  ["AD013","AS011","C010","T04","B","urgency",     "Video_15s",  "book_now", "Only 3 spots left this week",  "Draft","META","P3","Purchase"],
  ["AD014","AS012","C010","T04","A","social_proof","UGC",        "book_now", '"Warmest hour of my week"',    "Draft","META","P3","Purchase"],
  // ── GUEST P2 LISTING RT — T04 (ease vs social_proof) ─────────────────────
  ["AD015","AS013","C011","T04","A","ease",        "Carousel",   "book_now", "Browse → book in 2 mins",      "Draft","META","P2","InitiateCheckout"],
  ["AD016","AS013","C011","T04","B","social_proof","Static_9x16","book_now", "4.9 ★ across 50+ sessions",   "Draft","META","P2","InitiateCheckout"],
  // ── GUEST P1 WELLNESS PROSP — T05 (sensory vs community) ─────────────────
  ["AD017","AS014","C012","T05","A","sensory",     "Video_30s",  "explore",  "Heat. Steam. Silence.",        "Draft","META","P1","ViewContent"],
  ["AD018","AS014","C012","T05","B","community",   "Static_9x16","explore",  "Your neighbourhood sauna →",  "Draft","META","P1","ViewContent"],
  ["AD019","AS015","C013","T05","A","thermal",     "Video_15s",  "explore",  "Cold plunge. Hot sauna. Repeat.","Draft","META","P1","ViewContent"],
  ["AD020","AS015","C013","T05","B","social_proof","Static_9x16","explore",  "The recovery protocol →",      "Draft","META","P1","ViewContent"],
]

// ─── NAME GENERATORS ─────────────────────────────────────────────────────────
function campName(r) {
  // [Platform]_[Phase]_[Objective]_[Funnel]_[AudType]_[AudInterest]_[Geo]
  return `${r[1]}_${r[2]}_${r[3]}_${r[4]}_${r[5]}_${r[6]}_${r[7]}`
}
function adsetName(r) {
  // [CampaignName]_[SpaceType]_[AudSrc]_[Placement]
  return `${r[2]}_${r[3]}_${r[4]}_${r[5]}`
}
function adName(r) {
  // [AdSetName]_[TestID]_[Variant]_[Angle]_[Format]_[CTA]
  // AdSet name = from ADSETS lookup
  const adset = ADSETS.find(a => a[0] === r[1])
  const asName = adset ? adsetName(adset) : r[1]
  return `${asName}_${r[3]}_${r[4]}_${r[5]}_${r[6]}_${r[7]}`
}

// ─── TAB CONTENT ─────────────────────────────────────────────────────────────

const CAMP_HEADERS = [
  "Campaign ID","Platform","Phase","Objective","Funnel",
  "Audience Type","Audience Interest","Geo",
  "→ Campaign Name","Opt. Event","Priority","Notes",
]

const ADSET_HEADERS = [
  "Ad Set ID","Campaign ID","Campaign Name",
  "Space Type","Audience Src","Placement",
  "Audience Details / Notes",
  "→ Ad Set Name","Opt. Event","Budget Weight",
]

const CREATIVE_HEADERS = [
  "Ad ID","Ad Set ID","Campaign ID",
  "Test ID","Variant","Angle","Format","CTA",
  "→ Ad Name",
  "Hook Copy (first 3 words)","Status","Platform","Phase","Opt. Event",
]

// Section divider rows
const hostDivider = camp => [["","","","","","","","",`── HOST: ${camp} ──`,"","",""],[""],]
const guestDivider = camp => [["","","","","","","","",`── GUEST: ${camp} ──`,"","",""],[""],]

function buildCampRows() {
  const rows = []
  rows.push(
    ["thrml — Campaign Builder  |  Each row = one live campaign. IDs reference Ad Set Builder.","","","","","","","","","","",""],
    ["Campaign ID = C###  |  Blue = your inputs. Green = auto-generated name.","","","","","","","","","","",""],
    CAMP_HEADERS,
    ["","","","","","──── HOST CAMPAIGNS ────","","","","","",""],
  )
  for (const c of CAMPAIGNS) {
    const [id, ...rest] = c
    const name = campName(c)
    rows.push([id, ...rest.slice(0,7), name, ...rest.slice(7)])
  }
  return rows
}

function buildAdSetRows() {
  const rows = []
  rows.push(
    ["thrml — Ad Set Builder  |  Each row = one ad set. Campaign ID links back to Campaign Builder.","","","","","","","","",""],
    ["Ad Set ID = AS###  |  Paste Campaign ID from ② to cross-reference.","","","","","","","","",""],
    ADSET_HEADERS,
    ["","","","──── HOST AD SETS ────","","","","","",""],
  )
  let lastCampId = ""
  for (const a of ADSETS) {
    // Insert a visual break when campaign changes
    if (a[1] !== lastCampId && lastCampId !== "") {
      rows.push(["","","","","","","","","",""])
    }
    lastCampId = a[1]
    const [id, campId, campNameStr, spaceType, audSrc, placement, notes, optEvent, budget] = a
    const name = adsetName(a)
    rows.push([id, campId, campNameStr, spaceType, audSrc, placement, notes, name, optEvent, budget])
  }
  return rows
}

function buildCreativeRows() {
  const rows = []
  rows.push(
    ["thrml — Creative Builder  |  Each row = one ad. Ad Set ID + Campaign ID link back to previous tabs.","","","","","","","","","","","","",""],
    ["Ad ID = AD###  |  → Ad Name is auto-generated from Ad Set Name + creative tokens.","","","","","","","","","","","","",""],
    CREATIVE_HEADERS,
    ["","","","","","──── HOST CREATIVES ────","","","","","","","",""],
  )
  let lastCampId = "", lastAdSetId = ""
  for (const ad of CREATIVES) {
    const [adId, asId, cId, testId, variant, angle, format, cta, hook, status, platform, phase, optEvent] = ad
    // Insert break when ad set changes
    if (asId !== lastAdSetId && lastAdSetId !== "") {
      rows.push(["","","","","","","","","","","","","",""])
    }
    if (cId !== lastCampId && lastCampId !== "") {
      const isGuest = cId >= "C010"
      if (isGuest && lastCampId < "C010") {
        rows.push(["","","","","","──── GUEST CREATIVES ────","","","","","","","",""])
      }
    }
    lastAdSetId = asId; lastCampId = cId
    const name = adName(ad)
    rows.push([adId, asId, cId, testId, variant, angle, format, cta, name, hook, status, platform, phase, optEvent])
  }
  return rows
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────
async function format(sheetId, headerRow, totalCols, colWidths) {
  const dark     = { red:0.102,green:0.078,blue:0.063 }
  const white    = { red:1,green:1,blue:1 }
  const green    = { red:0.851,green:0.918,blue:0.827 }
  const blue     = { red:0.812,green:0.886,blue:0.953 }
  const requests = [
    // Freeze header + first 2 info rows
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: headerRow+1 } }, fields: "gridProperties.frozenRowCount" } },
    // Title rows (rows 0-1): subtle dark
    { repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalCols },
      cell: { userEnteredFormat: { backgroundColor:{red:0.15,green:0.12,blue:0.10}, textFormat:{foregroundColor:white,italic:true,fontSize:9} } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // Header row: full dark
    { repeatCell: {
      range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow+1, startColumnIndex: 0, endColumnIndex: totalCols },
      cell: { userEnteredFormat: { backgroundColor:dark, textFormat:{foregroundColor:white,bold:true,fontSize:10}, verticalAlignment:"MIDDLE", padding:{top:6,bottom:6} } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
    }},
    // ID col (col 0): tinted
    { repeatCell: {
      range: { sheetId, startRowIndex: headerRow+1, endRowIndex: 200, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor:{red:0.95,green:0.95,blue:1.0}, textFormat:{bold:true,fontSize:9,fontFamily:"Courier New"} } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // → Generated name col: green
    ...colWidths.filter(([,,,isGen]) => isGen).map(([s]) => ({ repeatCell: {
      range: { sheetId, startRowIndex: headerRow+1, endRowIndex: 200, startColumnIndex: s, endColumnIndex: s+1 },
      cell: { userEnteredFormat: { backgroundColor:green, textFormat:{fontSize:8, fontFamily:"Courier New"} } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }})),
    // Column widths
    ...colWidths.map(([s,e,px]) => ({ updateDimensionProperties: {
      range: { sheetId, dimension:"COLUMNS", startIndex:s, endIndex:e },
      properties: { pixelSize:px }, fields:"pixelSize"
    }})),
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🛠  thrml Namer Sheet — Full Rebuild\n")

  const meta = await sheets.spreadsheets.get({ spreadsheetId: ID })
  const tabMap = {}
  meta.data.sheets.forEach(t => { tabMap[t.properties.title] = t.properties.sheetId })

  const campRows   = buildCampRows()
  const adsetRows  = buildAdSetRows()
  const creativeRows = buildCreativeRows()

  // Write data
  const writes = [
    { tab: "② Campaign Builder",  rows: campRows,    hRow: 2, cols: CAMP_HEADERS.length },
    { tab: "③ Ad Set Builder",    rows: adsetRows,   hRow: 2, cols: ADSET_HEADERS.length },
    { tab: "④ Creative Builder",  rows: creativeRows,hRow: 2, cols: CREATIVE_HEADERS.length },
  ]

  for (const w of writes) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: `'${w.tab}'!A1:Z300` })
    await sheets.spreadsheets.values.update({
      spreadsheetId: ID, range: `'${w.tab}'!A1`,
      valueInputOption: "RAW", requestBody: { values: w.rows }
    })
    console.log(`✅ ${w.tab} — ${w.rows.length} rows`)
  }

  // Format each tab
  // [startCol, endCol, widthPx, isGeneratedCol?]
  await format(tabMap["② Campaign Builder"], 2, CAMP_HEADERS.length, [
    [0,1,70],[1,2,65],[2,3,45],[3,4,80],[4,5,70],
    [5,6,90],[6,7,110],[7,8,55],
    [8,9,270,true],  // → Campaign Name
    [9,10,160],[10,11,60],[11,12,260],
  ])
  await format(tabMap["③ Ad Set Builder"], 2, ADSET_HEADERS.length, [
    [0,1,70],[1,2,65],[2,3,270],
    [3,4,90],[4,5,90],[5,6,100],[6,7,260],
    [7,8,360,true],  // → Ad Set Name
    [8,9,170],[9,10,120],
  ])
  await format(tabMap["④ Creative Builder"], 2, CREATIVE_HEADERS.length, [
    [0,1,65],[1,2,65],[2,3,65],
    [3,4,55],[4,5,55],[5,6,100],[6,7,100],[7,8,85],
    [8,9,420,true],  // → Ad Name
    [9,10,200],[10,11,70],[11,12,65],[12,13,45],[13,14,170],
  ])

  console.log("✅ Formatting applied")
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${ID}\n`)

  // Print a quick summary of generated names for verification
  console.log("\n📋 GENERATED NAMES SAMPLE:\n")
  for (const c of CAMPAIGNS.slice(0,3)) { console.log(" CAMP:", campName(c)) }
  for (const a of ADSETS.slice(0,3))    { console.log(" ADSET:", adsetName(a)) }
  for (const ad of CREATIVES.slice(0,3)){ console.log(" AD:", adName(ad)) }
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
