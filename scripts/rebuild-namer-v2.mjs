import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const ID = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

const ADSET_GID  = 603831521
const CREAT_GID  = 1466176529

// ── Current Campaign Builder state (read-only reference) ──────────────────
// C001: META P1 PROSP REACH host ALL       → become_host_click
// C002: META P1 PROSP REACH host ALL       → become_host_click  (sauna-specific)
// C003: META P2 PROSP LEAD host ALL        → host_onboarding_started
// C004: META P2 LAL  LEAD host ALL         → host_onboarding_started
// C005: META P3 LAL  CONV host ALL         → listing_created
// C006: META P3 LAL  CONV host ALL         → listing_created    (sauna-specific)
// C007: GOOG P1 PROSP CONV host SEA        → become_host_click
// C008: GOOG P2 PROSP CONV host SEA        → host_onboarding_started
// C009: GOOG P3 PROSP CONV host SEA        → listing_created
// C010: META P2 RT   CONV guest ALL        → InitiateCheckout
// C011: META P1 PROSP CONV guest ALL       → ViewContent
// C012: META P1 PROSP CONV guest ALL       → ViewContent  (biohacking)
// C013: GOOG P3 RT   CONV guest ALL        → Purchase
// C014: GOOG P1 PROSP CONV guest SEA       → ViewContent

// ── Ad Set data ────────────────────────────────────────────────────────────
// [AsID, CampID, SpaceType, AudSrc, Placement, Notes, BudgetWeight]
// Conv. Event & Campaign Name come from VLOOKUP → Campaign Builder
const ADSETS = [
  // ── C001: META P1 host broad — 4 interest segments ──────────────────────
  ["AS001","C001","sauna",     "int",        "FEED-STORIES","Nordic, Finnish, Barrel, Infrared sauna",          "35%"],
  ["AS002","C001","hottub",    "int",        "FEED-STORIES","Hot tub, Jacuzzi, Hydrotherapy, Spa (home)",       "25%"],
  ["AS003","C001","coldplunge","int",        "FEED-STORIES","Ice bath, Cold therapy, Wim Hof, Huberman",        "20%"],
  ["AS004","C001","income",    "int",        "FEED-STORIES","Passive income, Airbnb host, Vacation rental",     "20%"],
  // ── C002: META P1 host sauna-specific — 2 placement segments ─────────────
  ["AS005","C002","sauna",     "int",        "REELS",       "Cedar barrel, outdoor sauna, home sauna kit",      "50%"],
  ["AS006","C002","sauna",     "int",        "FEED-STORIES","Sauna culture, Finnish lifestyle, wellness ritual","50%"],
  // ── C003: META P2 host PROSP — 3 LAL tiers ───────────────────────────────
  ["AS007","C003","sauna",     "lal1",       "FEED-STORIES","1% LAL of P1 become_host_click events",            "40%"],
  ["AS008","C003","income",    "lal1",       "FEED-STORIES","1% LAL of P1 become_host_click — all types",      "30%"],
  ["AS009","C003","sauna",     "lal2",       "FEED-STORIES","2% LAL expansion — broader reach, lower CPM",     "30%"],
  // ── C004: META P2 host LAL — 2 segments ──────────────────────────────────
  ["AS010","C004","sauna",     "lal1",       "FEED-STORIES","1% LAL from C002 sauna interest engagement",       "50%"],
  ["AS011","C004","income",    "lal2",       "FEED-STORIES","2% LAL — income + sauna combined signal",          "50%"],
  // ── C005: META P3 host LAL — 2 segments ──────────────────────────────────
  ["AS012","C005","sauna",     "lal2",       "FEED-STORIES","2% LAL of P2 host_onboarding_started events",     "50%"],
  ["AS013","C005","income",    "lal2",       "FEED-STORIES","Advantage+ (activate after 100+ P3 events)",      "50%"],
  // ── C006: META P3 host sauna LAL — 2 segments ────────────────────────────
  ["AS014","C006","sauna",     "lal2",       "FEED-STORIES","2% LAL — sauna-specific angle, cedar aesthetic",   "60%"],
  ["AS015","C006","sauna",     "lal2",       "REELS",       "Reels placement — short-form sauna video",         "40%"],
  // ── C007: GOOG P1 host search ─────────────────────────────────────────────
  ["AS016","C007","income",    "int",        "SEARCH",      "'sauna rental near me', 'rent sauna space', 'become sauna host'","100%"],
  // ── C008: GOOG P2 host search ─────────────────────────────────────────────
  ["AS017","C008","income",    "int",        "SEARCH",      "'list sauna space', 'rent out my sauna', host intent kws","100%"],
  // ── C009: GOOG P3 host search ─────────────────────────────────────────────
  ["AS018","C009","income",    "int",        "PMAX",        "Performance Max — host listing, conversion-optimised","60%"],
  ["AS019","C009","sauna",     "int",        "SEARCH",      "'how to list sauna', 'sauna rental income' high-intent","40%"],
  // ── C010: META P2 guest RT listing view ──────────────────────────────────
  ["AS020","C010","all_spaces","rt_listing", "FEED-STORIES","RT: ViewContent any listing 7d. Excl: IC + purchasers.","60%"],
  ["AS021","C010","sauna",     "rt_listing", "FEED-STORIES","RT: sauna listing views only 7d — space-specific creative","40%"],
  // ── C011: META P1 guest cold wellness ────────────────────────────────────
  ["AS022","C011","gen",       "int",        "FEED-STORIES","Wellness, yoga, spa, sauna, mindfulness, Calm, Headspace","60%"],
  ["AS023","C011","gen",       "int",        "REELS",       "Wellness Reels — short recovery/ritual content",   "40%"],
  // ── C012: META P1 guest cold biohacking ──────────────────────────────────
  ["AS024","C012","gen",       "int",        "FEED-STORIES","Ice bath, Wim Hof, biohacking, Huberman, longevity","100%"],
  // ── C013: GOOG P3 guest RT checkout ──────────────────────────────────────
  ["AS025","C013","all_spaces","rt_checkout","SEARCH",      "Google Search RT: /book/ visitors 14d. 'sauna rental', 'book sauna'","60%"],
  ["AS026","C013","all_spaces","rt_checkout","DEMAND-GEN",  "Google Demand Gen RT — remarketing list, all space types","40%"],
  // ── C014: GOOG P1 guest Demand Gen wellness ───────────────────────────────
  ["AS027","C014","gen",       "int",        "DEMAND-GEN",  "Demand Gen: wellness audiences, Seattle DMA, GA4 purchaser LAL","100%"],
]

// ── Creative data ─────────────────────────────────────────────────────────
// [AdID, AsID, CampID, TestID, Variant, Angle, FmtType, Length, Ratio, CTA, Hook, Status, Platform, Phase]
// NOTE: Aspect ratio uses "x" notation (9x16, 1x1) to avoid Google Sheets time-parse bug ("9:16" → 0.386)
// Conv. Event and Ad Set Name come from VLOOKUP formulas
const CREATIVES = [
  // ── T01 — HOST P1: income vs community angle ──────────────────────────────
  ["AD001","AS001","C001","T01","A","income",      "Static","NA",  "9x16","list_now",  "Your sauna sits empty 6 days…",  "Live",   "META","P1"],
  ["AD002","AS001","C001","T01","B","community",   "Static","NA",  "9x16","list_now",  "Join 200+ hosts sharing…",       "Testing","META","P1"],
  ["AD003","AS002","C001","T01","A","idle_space",  "Static","NA",  "9x16","list_now",  "Hot tub on → guests off →…",     "Live",   "META","P1"],
  ["AD004","AS002","C001","T01","B","income",      "Video", "15s", "9x16","list_now",  "$400/month. Same hot tub.",       "Testing","META","P1"],
  ["AD005","AS016","C007","T01","A","income",      "RSA",   "NA",  "NA",  "list_now",  "Earn from your sauna today",     "Live",   "GOOG","P1"],
  // ── T02 — HOST P2: idle_space vs social_proof ────────────────────────────
  ["AD006","AS007","C003","T02","A","idle_space",  "Video", "15s", "9x16","get_started","Setup takes 10 minutes…",       "Draft",  "META","P2"],
  ["AD007","AS007","C003","T02","B","social_proof","Carousel","NA","1x1", "get_started","See what hosts earn…",          "Draft",  "META","P2"],
  ["AD008","AS008","C003","T02","A","community",   "Static","NA",  "9x16","get_started","Your space. Your rules.",       "Draft",  "META","P2"],
  // ── T03 — HOST P3: social_proof vs urgency ───────────────────────────────
  ["AD009","AS012","C005","T03","A","social_proof","Static","NA",  "9x16","list_now",  "First booking in 48 hrs",        "Draft",  "META","P3"],
  ["AD010","AS012","C005","T03","B","urgency",     "Video", "30s", "9x16","list_now",  "Limited spots in Seattle",       "Draft",  "META","P3"],
  ["AD011","AS013","C005","T03","A","social_proof","UGC",   "NA",  "9x16","list_now",  "I listed mine last week…",       "Draft",  "META","P3"],
  // ── T04 — GUEST P2 listing RT: ease vs social_proof ─────────────────────
  ["AD012","AS020","C010","T04","A","ease",        "Carousel","NA","1x1", "book_now",  "Browse → book in 2 mins",        "Draft",  "META","P2"],
  ["AD013","AS020","C010","T04","B","social_proof","Static","NA",  "9x16","book_now",  "4.9 ★ across 50+ sessions",     "Draft",  "META","P2"],
  // ── T04 — GUEST P3 GOOG RT: fomo vs urgency ─────────────────────────────
  ["AD014","AS025","C013","T04","A","fomo",        "Static","NA",  "9x16","book_now",  "You were this close…",           "Draft",  "GOOG","P3"],
  ["AD015","AS025","C013","T04","B","urgency",     "Video", "15s", "9x16","book_now",  "Only 3 spots left this week",    "Draft",  "GOOG","P3"],
  ["AD016","AS026","C013","T04","A","social_proof","UGC",   "NA",  "9x16","book_now",  '"Warmest hour of my week"',      "Draft",  "GOOG","P3"],
  // ── T05 — GUEST P1 wellness: sensory vs community ────────────────────────
  ["AD017","AS022","C011","T05","A","sensory",     "Video", "30s", "9x16","explore",   "Heat. Steam. Silence.",          "Draft",  "META","P1"],
  ["AD018","AS022","C011","T05","B","community",   "Static","NA",  "9x16","explore",   "Your neighbourhood sauna →",     "Draft",  "META","P1"],
  ["AD019","AS024","C012","T05","A","thermal",     "Video", "15s", "9x16","explore",   "Cold plunge. Hot sauna. Repeat.","Draft",  "META","P1"],
  ["AD020","AS024","C012","T05","B","social_proof","Static","NA",  "9x16","explore",   "The recovery protocol →",        "Draft",  "META","P1"],
]

// ── Headers ───────────────────────────────────────────────────────────────
const AS_HEADERS = [
  "Ad Set ID", "Campaign ID", "Campaign Name",
  "Space Type", "Audience Src", "Placement", "Audience Details / Notes",
  "→ Ad Set Name", "Conv. Event", "Budget Weight",
]
// Col indices (0-based): A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9

const CR_HEADERS = [
  "Ad ID", "Ad Set ID", "Campaign ID",
  "Test ID", "Variant", "Angle",
  "Format Type", "Length", "Aspect Ratio", "CTA",
  "Ad Set Name", "→ Ad Name",
  "Hook Copy (first 3 words)", "Status", "Platform", "Phase", "Conv. Event",
]
// Col indices: A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10 L=11 M=12 N=13 O=14 P=15 Q=16

// ── Row builders ──────────────────────────────────────────────────────────
function asRow(d, rowIdx) {
  // rowIdx is 0-based data index; sheet row = rowIdx + 2 (header is row 1)
  const r = rowIdx + 2
  const [asId, campId, space, audSrc, placement, notes, budget] = d
  return [
    asId,
    campId,
    `=IFERROR(VLOOKUP(B${r},'② Campaign Builder'!A:I,9,FALSE),"")`,  // Campaign Name (col I = index 9)
    space, audSrc, placement, notes,
    `=C${r}&"_"&D${r}&"_"&E${r}&"_"&F${r}`,                          // → Ad Set Name
    `=IFERROR(VLOOKUP(B${r},'② Campaign Builder'!A:J,10,FALSE),"")`, // Conv. Event (col J = index 10)
    budget,
  ]
}

function crRow(d, rowIdx) {
  const r = rowIdx + 2
  const [adId, asId, campId, testId, variant, angle, fmt, length, ratio, cta, hook, status, platform, phase] = d
  return [
    adId, asId, campId, testId, variant, angle, fmt, length, ratio, cta,
    // K: Ad Set Name via VLOOKUP → ③ Ad Set Builder col H (index 8)
    `=IFERROR(VLOOKUP(B${r},'③ Ad Set Builder'!A:H,8,FALSE),"")`,
    // L: → Ad Name
    `=K${r}&"_"&D${r}&"_"&E${r}&"_"&F${r}&"_"&G${r}` +
    `&IF(H${r}<>"NA","_"&H${r},"")` +
    `&IF(I${r}<>"NA","_"&I${r},"")` +
    `&"_"&J${r}`,
    hook, status, platform, phase,
    // Q: Conv. Event via VLOOKUP on Campaign ID (col C) → Campaign Builder col J
    `=IFERROR(VLOOKUP(C${r},'② Campaign Builder'!A:J,10,FALSE),"")`,
  ]
}

// ── Dropdown helper ───────────────────────────────────────────────────────
function dd(sheetId, r1, r2, c1, c2, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: values.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true, strict: false,
      }
    }
  }
}
function clrVal(sheetId, r1, r2, c1, c2) {
  return { setDataValidation: { range: { sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 }, rule: null } }
}

// ── Format helpers ────────────────────────────────────────────────────────
const dark  = { red:0.102, green:0.078, blue:0.063 }
const white = { red:1, green:1, blue:1 }
const green = { red:0.851, green:0.918, blue:0.827 }
const idBg  = { red:0.95, green:0.95, blue:1.0 }
const lookupBg = { red:0.95, green:0.98, blue:0.95 }

function headerFmt(sheetId, numCols) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
      cell: { userEnteredFormat: {
        backgroundColor: dark,
        textFormat: { foregroundColor: white, bold: true, fontSize: 10 },
        verticalAlignment: "MIDDLE", padding: { top: 6, bottom: 6 }
      }},
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
    }
  }
}
function colFmt(sheetId, startRow, endRow, startCol, endCol, bg, textFmt) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { backgroundColor: bg, textFormat: textFmt } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }
  }
}
function cw(sheetId, s, e, px) {
  return { updateDimensionProperties: {
    range: { sheetId, dimension: "COLUMNS", startIndex: s, endIndex: e },
    properties: { pixelSize: px }, fields: "pixelSize"
  }}
}
function freeze(sheetId, n) {
  return { updateSheetProperties: {
    properties: { sheetId, gridProperties: { frozenRowCount: n } },
    fields: "gridProperties.frozenRowCount"
  }}
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🛠  Namer rebuild v2 — Ad Set Builder + Creative Builder\n")

  // ── 1. BUILD AD SET ROWS ─────────────────────────────────────────────────
  const asRows = [AS_HEADERS, ...ADSETS.map((d, i) => asRow(d, i))]

  // ── 2. BUILD CREATIVE ROWS ───────────────────────────────────────────────
  const crRows = [CR_HEADERS, ...CREATIVES.map((d, i) => crRow(d, i))]

  // ── 3. WRITE DATA ────────────────────────────────────────────────────────
  // IMPORTANT: Use USER_ENTERED so formulas evaluate. Aspect ratios use "x" notation
  // to avoid the "9:16" → time parse bug.
  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: "'③ Ad Set Builder'!A1:K200" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID, range: "'③ Ad Set Builder'!A1",
    valueInputOption: "USER_ENTERED", requestBody: { values: asRows }
  })
  console.log(`✅ Ad Set Builder — ${ADSETS.length} rows`)

  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: "'④ Creative Builder'!A1:R200" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID, range: "'④ Creative Builder'!A1",
    valueInputOption: "USER_ENTERED", requestBody: { values: crRows }
  })
  console.log(`✅ Creative Builder — ${CREATIVES.length} rows`)

  // ── 4. VALIDATION ────────────────────────────────────────────────────────
  const valReqs = [
    // Clear everything first
    clrVal(ADSET_GID, 0, 200, 0, 12),
    clrVal(CREAT_GID, 0, 200, 0, 20),

    // ③ Ad Set Builder dropdowns (data rows = indices 1–200)
    // A (0) = Ad Set ID: plain text, no validation
    // B (1) = Campaign ID: plain text, no validation
    // C (2) = Campaign Name: formula, no validation
    dd(ADSET_GID, 1, 60, 3, 4, ["sauna","hottub","coldplunge","income","gen","all_spaces"]),        // D SpaceType
    dd(ADSET_GID, 1, 60, 4, 5, ["int","lal1","lal2","crmatch","rt_checkout","rt_listing"]),         // E AudSrc
    dd(ADSET_GID, 1, 60, 5, 6, ["FEED-STORIES","FEED","REELS","STORIES","SEARCH","PMAX","DEMAND-GEN"]), // F Placement
    // G = notes: free text
    // H = Ad Set Name formula: no validation
    // I = Conv. Event formula: no validation
    // J = Budget Weight: free text

    // ④ Creative Builder dropdowns
    // A,B,C = IDs: no validation
    dd(CREAT_GID, 1, 60, 3, 4, ["T01","T02","T03","T04","T05","T06","T07"]),                        // D TestID
    dd(CREAT_GID, 1, 60, 4, 5, ["A","B","C"]),                                                      // E Variant
    dd(CREAT_GID, 1, 60, 5, 6, ["income","community","idle_space","social_proof","urgency","fomo","sensory","thermal","ease","educational"]), // F Angle
    dd(CREAT_GID, 1, 60, 6, 7, ["Static","Video","Carousel","UGC","RSA"]),                          // G FormatType
    dd(CREAT_GID, 1, 60, 7, 8, ["NA","6s","15s","30s","60s"]),                                      // H Length
    dd(CREAT_GID, 1, 60, 8, 9, ["9x16","1x1","4x5","16x9","NA"]),                                   // I AspectRatio (x notation)
    dd(CREAT_GID, 1, 60, 9, 10, ["list_now","get_started","see_how","learn_more","book_now","explore","sign_up"]), // J CTA
    // K = Ad Set Name lookup: no validation
    // L = Ad Name formula: no validation
    dd(CREAT_GID, 1, 60, 13, 14, ["Live","Testing","Draft","Paused","Archived","Winner","Killed"]), // N Status
    dd(CREAT_GID, 1, 60, 14, 15, ["META","GOOG","SNAP","TIKTOK"]),                                  // O Platform
    dd(CREAT_GID, 1, 60, 15, 16, ["P1","P2","P3"]),                                                 // P Phase
    // Q = Conv. Event formula: no validation
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: valReqs } })
  console.log("✅ Validation applied")

  // ── 5. FORMATTING ────────────────────────────────────────────────────────
  const mono9  = { fontFamily: "Courier New", fontSize: 9 }
  const mono8  = { fontFamily: "Courier New", fontSize: 8 }
  const bold9  = { bold: true, fontFamily: "Courier New", fontSize: 9 }

  const fmtReqs = [
    // ③ Ad Set Builder
    freeze(ADSET_GID, 1),
    headerFmt(ADSET_GID, AS_HEADERS.length),
    colFmt(ADSET_GID, 1, 100, 0, 2, idBg, bold9),           // A-B: IDs
    colFmt(ADSET_GID, 1, 100, 2, 3, lookupBg, mono8),        // C: Campaign Name lookup
    colFmt(ADSET_GID, 1, 100, 7, 8, green, mono8),           // H: → Ad Set Name
    colFmt(ADSET_GID, 1, 100, 8, 9, lookupBg, mono9),        // I: Conv. Event lookup
    // Col widths
    cw(ADSET_GID, 0,1, 75),  // Ad Set ID
    cw(ADSET_GID, 1,2, 70),  // Campaign ID
    cw(ADSET_GID, 2,3, 240), // Campaign Name
    cw(ADSET_GID, 3,4, 90),  // Space Type
    cw(ADSET_GID, 4,5, 90),  // Audience Src
    cw(ADSET_GID, 5,6, 110), // Placement
    cw(ADSET_GID, 6,7, 260), // Details
    cw(ADSET_GID, 7,8, 380), // → Ad Set Name
    cw(ADSET_GID, 8,9, 180), // Conv. Event
    cw(ADSET_GID, 9,10, 90), // Budget

    // ④ Creative Builder
    freeze(CREAT_GID, 1),
    headerFmt(CREAT_GID, CR_HEADERS.length),
    colFmt(CREAT_GID, 1, 100, 0, 3, idBg, bold9),            // A-C: IDs
    colFmt(CREAT_GID, 1, 100, 10, 11, lookupBg, mono8),      // K: Ad Set Name lookup
    colFmt(CREAT_GID, 1, 100, 11, 12, green, mono8),         // L: → Ad Name
    colFmt(CREAT_GID, 1, 100, 16, 17, lookupBg, mono9),      // Q: Conv. Event lookup
    // Amber tint on Format group (G,H,I)
    colFmt(CREAT_GID, 0, 1, 6, 9, {red:1,green:0.85,blue:0.4}, {bold:true,fontSize:10}),
    // Col widths
    cw(CREAT_GID, 0,1, 65),  // Ad ID
    cw(CREAT_GID, 1,2, 65),  // Ad Set ID
    cw(CREAT_GID, 2,3, 65),  // Campaign ID
    cw(CREAT_GID, 3,4, 55),  // Test ID
    cw(CREAT_GID, 4,5, 50),  // Variant
    cw(CREAT_GID, 5,6, 105), // Angle
    cw(CREAT_GID, 6,7, 75),  // Format Type
    cw(CREAT_GID, 7,8, 65),  // Length
    cw(CREAT_GID, 8,9, 70),  // Aspect Ratio
    cw(CREAT_GID, 9,10, 85), // CTA
    cw(CREAT_GID, 10,11, 310), // Ad Set Name
    cw(CREAT_GID, 11,12, 400), // → Ad Name
    cw(CREAT_GID, 12,13, 200), // Hook Copy
    cw(CREAT_GID, 13,14, 75),  // Status
    cw(CREAT_GID, 14,15, 65),  // Platform
    cw(CREAT_GID, 15,16, 45),  // Phase
    cw(CREAT_GID, 16,17, 175), // Conv. Event
  ]

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: fmtReqs } })
  console.log("✅ Formatting applied")

  // ── 6. SUMMARY ────────────────────────────────────────────────────────────
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${ID}`)
  console.log(`\nAd sets by campaign:`)
  const byCamp = {}
  ADSETS.forEach(a => { byCamp[a[1]] = (byCamp[a[1]]??0) + 1 })
  Object.entries(byCamp).forEach(([c,n]) => console.log(`  ${c}: ${n} ad sets`))
  console.log(`\nTotal: ${ADSETS.length} ad sets, ${CREATIVES.length} creatives\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
