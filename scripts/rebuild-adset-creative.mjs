import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const ID = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"
const ADSET_GID  = 603831521
const CREAT_GID  = 1466176529

// ── Ad Set Builder ──────────────────────────────────────────────────────────
// Columns: A=AdSetID | B=CampID | C=CampName(formula) | D=SpaceType | E=AudSrc | F=Placement | G=AudDetails | H=→AdSetName(formula) | I=OptEvent | J=BudgetWeight
// Column C = VLOOKUP(B, CampaignBuilder!A:I, 9, FALSE)  → Campaign Builder col I is Campaign Name
// Column H = C&"_"&D&"_"&E&"_"&F

const ADSET_HEADERS = [
  "Ad Set ID","Campaign ID","Campaign Name",
  "Space Type","Audience Src","Placement",
  "Audience Details / Notes",
  "→ Ad Set Name","Opt. Event","Budget Weight",
]

// [AdSetID, CampID, SpaceType, AudSrc, Placement, AudDetails, OptEvent, BudgetWeight]
const ADSET_DATA = [
  ["AS001","C001","sauna",    "int",       "FEED-STORIES","Nordic, Finnish, Barrel, Infrared sauna",         "become_host_click",     "35%"],
  ["AS002","C001","hottub",   "int",       "FEED-STORIES","Hot tub, Jacuzzi, Hydrotherapy, Spa (home)",      "become_host_click",     "25%"],
  ["AS003","C001","coldplunge","int",      "FEED-STORIES","Ice bath, Cold therapy, Wim Hof, Huberman",       "become_host_click",     "20%"],
  ["AS004","C001","income",   "int",       "FEED-STORIES","Passive income, Airbnb host, Vacation rental",    "become_host_click",     "20%"],
  ["AS005","C003","sauna",    "lal1",      "FEED-STORIES","1% LAL of P1 become_host_click events",           "host_onboarding_started","40%"],
  ["AS006","C003","income",   "lal1",      "FEED-STORIES","1% LAL of P1 become_host_click — all types",     "host_onboarding_started","30%"],
  ["AS007","C003","sauna",    "lal2",      "FEED-STORIES","2% LAL expansion — broader, lower CPM",           "host_onboarding_started","30%"],
  ["AS008","C005","sauna",    "lal2",      "FEED-STORIES","2% LAL of P2 host_onboarding_started events",    "listing_created",       "50%"],
  ["AS009","C005","income",   "lal2",      "FEED-STORIES","Advantage+ audiences (after 100+ P3 events)",    "listing_created",       "50%"],
  ["AS010","C007","income",   "int",       "SEARCH",      "'sauna rental near me', 'rent sauna space'",      "become_host_click",     "100%"],
  ["AS011","C010","all_spaces","rt_checkout","FEED-STORIES","RT: InitiateCheckout no Purchase, 14d. Excl: purchasers.","Purchase","40%"],
  ["AS012","C010","sauna",    "rt_checkout","FEED-STORIES","RT: sauna listing views, no checkout, 7d",       "Purchase",              "0% — activate when freq > 3"],
  ["AS013","C013","all_spaces","rt_listing","FEED-STORIES","RT: ViewContent any listing 7d. Excl: IC + purchasers.","InitiateCheckout","35%"],
  ["AS014","C011","gen",      "int",       "FEED-STORIES","Wellness, yoga, spa, sauna, mindfulness, Calm",   "ViewContent",           "15%"],
  ["AS015","C012","gen",      "int",       "FEED-STORIES","Ice bath, Wim Hof, biohacking, Huberman, longevity","ViewContent",         "10%"],
  ["AS016","C013","all_spaces","rt_checkout","SEARCH",    "Google Search RT: /book/ visitors 14d. 'sauna rental'","Purchase",          "60% of Google"],
  ["AS017","C014","gen",      "int",       "DEMAND-GEN",  "Demand Gen: wellness audiences, Seattle DMA, GA4 LAL","ViewContent",        "40% of Google"],
]

function adsetRow(d, i) {
  const row = i + 2  // header is row 1 (index 0), data starts row 2 (index 1) → sheet row = i+2
  const [asId, campId, spaceType, audSrc, placement, notes, optEvent, budget] = d
  const campNameFormula = `=IFERROR(VLOOKUP(B${row},'② Campaign Builder'!A:I,9,FALSE),"")`
  const adSetNameFormula = `=C${row}&"_"&D${row}&"_"&E${row}&"_"&F${row}`
  return [asId, campId, campNameFormula, spaceType, audSrc, placement, notes, adSetNameFormula, optEvent, budget]
}

// ── Creative Builder ────────────────────────────────────────────────────────
// Columns: A=AdID | B=AdSetID | C=CampID | D=TestID | E=Variant | F=Angle |
//          G=FormatType | H=Length | I=AspectRatio | J=CTA |
//          K=AdSetName(formula) | L=→AdName(formula) |
//          M=HookCopy | N=Status | O=Platform | P=Phase | Q=OptEvent
// Column K = VLOOKUP(B, AdSetBuilder!A:H, 8, FALSE)   → Ad Set Builder col H is Ad Set Name
// Column L = K&"_"&D&"_"&E&"_"&F&"_"&G&IF(H<>"NA","_"&H,"")&IF(I<>"NA","_"&I,"")&"_"&J

const CREAT_HEADERS = [
  "Ad ID","Ad Set ID","Campaign ID",
  "Test ID","Variant","Angle",
  "Format Type","Length","Aspect Ratio","CTA",
  "Ad Set Name","→ Ad Name",
  "Hook Copy (first 3 words)","Status","Platform","Phase","Opt. Event",
]

// [AdID, AsID, CampID, TestID, Variant, Angle, FmtType, Length, Ratio, CTA, Hook, Status, Platform, Phase, OptEvent]
const CREAT_DATA = [
  ["AD001","AS001","C001","T01","A","income",      "Static","NA","9:16","list_now", "Your sauna sits empty 6 days…","Live",   "META","P1","become_host_click"],
  ["AD002","AS001","C001","T01","B","community",   "Static","NA","9:16","list_now", "Join 200+ hosts sharing…",     "Testing","META","P1","become_host_click"],
  ["AD003","AS002","C001","T01","A","idle_space",  "Static","NA","9:16","list_now", "Hot tub on → guests off →…",   "Live",   "META","P1","become_host_click"],
  ["AD004","AS002","C001","T01","B","income",      "Video", "15s","9:16","list_now", "$400/month. Same hot tub.",    "Testing","META","P1","become_host_click"],
  ["AD005","AS010","C007","T01","A","income",      "RSA",  "NA", "NA", "list_now", "Earn from your sauna today",   "Live",   "GOOG","P1","become_host_click"],
  ["AD006","AS005","C003","T02","A","idle_space",  "Video","15s","9:16","get_started","Setup takes 10 minutes…",   "Draft",  "META","P2","host_onboarding_started"],
  ["AD007","AS005","C003","T02","B","social_proof","Carousel","NA","1:1","get_started","See what hosts earn…",     "Draft",  "META","P2","host_onboarding_started"],
  ["AD008","AS006","C003","T02","A","community",   "Static","NA","9:16","get_started","Your space. Your rules.",   "Draft",  "META","P2","host_onboarding_started"],
  ["AD009","AS008","C005","T03","A","social_proof","Static","NA","9:16","list_now", "First booking in 48 hrs",     "Draft",  "META","P3","listing_created"],
  ["AD010","AS008","C005","T03","B","urgency",     "Video","30s","9:16","list_now", "Limited spots in Seattle",    "Draft",  "META","P3","listing_created"],
  ["AD011","AS009","C005","T03","A","social_proof","UGC",  "NA","9:16","list_now", "I listed mine last week…",     "Draft",  "META","P3","listing_created"],
  ["AD012","AS011","C010","T04","A","fomo",        "Static","NA","9:16","book_now", "You were this close…",        "Draft",  "META","P3","Purchase"],
  ["AD013","AS011","C010","T04","B","urgency",     "Video","15s","9:16","book_now", "Only 3 spots left this week", "Draft",  "META","P3","Purchase"],
  ["AD014","AS012","C010","T04","A","social_proof","UGC",  "NA","9:16","book_now", '"Warmest hour of my week"',   "Draft",  "META","P3","Purchase"],
  ["AD015","AS013","C013","T04","A","ease",        "Carousel","NA","1:1","book_now","Browse → book in 2 mins",    "Draft",  "META","P2","InitiateCheckout"],
  ["AD016","AS013","C013","T04","B","social_proof","Static","NA","9:16","book_now", "4.9 ★ across 50+ sessions",  "Draft",  "META","P2","InitiateCheckout"],
  ["AD017","AS014","C011","T05","A","sensory",     "Video","30s","9:16","explore",  "Heat. Steam. Silence.",       "Draft",  "META","P1","ViewContent"],
  ["AD018","AS014","C011","T05","B","community",   "Static","NA","9:16","explore",  "Your neighbourhood sauna →",  "Draft",  "META","P1","ViewContent"],
  ["AD019","AS015","C012","T05","A","thermal",     "Video","15s","9:16","explore",  "Cold plunge. Hot sauna. Repeat.","Draft","META","P1","ViewContent"],
  ["AD020","AS015","C012","T05","B","social_proof","Static","NA","9:16","explore",  "The recovery protocol →",     "Draft",  "META","P1","ViewContent"],
]

function creativeRow(d, i) {
  const row = i + 2
  const [adId,asId,cId,testId,variant,angle,fmtType,length,ratio,cta,hook,status,platform,phase,optEvent] = d
  const adSetNameFormula = `=IFERROR(VLOOKUP(B${row},'③ Ad Set Builder'!A:H,8,FALSE),"")`
  // Build Ad Name: AdSetName_TestID_Variant_Angle_FormatType[_Length][_Ratio]_CTA
  const adNameFormula =
    `=K${row}&"_"&D${row}&"_"&E${row}&"_"&F${row}&"_"&G${row}` +
    `&IF(H${row}<>"NA","_"&H${row},"")` +
    `&IF(I${row}<>"NA","_"&I${row},"")` +
    `&"_"&J${row}`
  return [adId,asId,cId,testId,variant,angle,fmtType,length,ratio,cta,adSetNameFormula,adNameFormula,hook,status,platform,phase,optEvent]
}

// ── Validation rules ──────────────────────────────────────────────────────────
function dropdown(sheetId, startRow, endRow, startCol, endCol, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      rule: { condition: { type: "ONE_OF_LIST", values: values.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false }
    }
  }
}
function clearVal(sheetId, startRow, endRow, startCol, endCol) {
  return { setDataValidation: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol }, rule: null } }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const dark  = {red:0.102,green:0.078,blue:0.063}
const white = {red:1,green:1,blue:1}
const green = {red:0.851,green:0.918,blue:0.827}
const idTint = {red:0.95,green:0.95,blue:1.0}

function buildFormatRequests(sheetId, numDataCols, generatedColIdx, idColCount, colWidths) {
  return [
    // Freeze header row
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    // Header row dark
    { repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numDataCols },
      cell: { userEnteredFormat: { backgroundColor: dark, textFormat: { foregroundColor: white, bold: true, fontSize: 10 }, verticalAlignment: "MIDDLE", padding: { top: 6, bottom: 6 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
    }},
    // ID columns (first idColCount cols): monospace tint
    { repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 0, endColumnIndex: idColCount },
      cell: { userEnteredFormat: { backgroundColor: idTint, textFormat: { bold: true, fontSize: 9, fontFamily: "Courier New" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // Generated name column: green monospace
    { repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 200, startColumnIndex: generatedColIdx, endColumnIndex: generatedColIdx + 1 },
      cell: { userEnteredFormat: { backgroundColor: green, textFormat: { fontSize: 8, fontFamily: "Courier New" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // Column widths
    ...colWidths.map(([s, e, px]) => ({ updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: s, endIndex: e },
      properties: { pixelSize: px }, fields: "pixelSize"
    }})),
  ]
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🛠  Rebuilding Ad Set Builder + Creative Builder\n")

  // ── 1. Ad Set Builder ────────────────────────────────────────────────────
  const adsetRows = [
    ADSET_HEADERS,
    ...ADSET_DATA.map((d, i) => adsetRow(d, i)),
  ]

  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: "'③ Ad Set Builder'!A1:Z200" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID, range: "'③ Ad Set Builder'!A1",
    valueInputOption: "USER_ENTERED",  // so formulas evaluate
    requestBody: { values: adsetRows }
  })
  console.log(`✅ Ad Set Builder — ${ADSET_DATA.length} rows`)

  // ── 2. Creative Builder ──────────────────────────────────────────────────
  const creativeRows = [
    CREAT_HEADERS,
    ...CREAT_DATA.map((d, i) => creativeRow(d, i)),
  ]

  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: "'④ Creative Builder'!A1:Z200" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID, range: "'④ Creative Builder'!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: creativeRows }
  })
  console.log(`✅ Creative Builder — ${CREAT_DATA.length} rows`)

  // ── 3. Validation ────────────────────────────────────────────────────────
  const valRequests = [
    // Ad Set Builder — clear all first
    clearVal(ADSET_GID, 0, 200, 0, 12),
    // Ad Set ID (col A), Campaign ID (col B), Campaign Name formula (col C) → no validation
    dropdown(ADSET_GID, 1, 60, 3, 4, ["sauna","hottub","coldplunge","income","gen","all_spaces"]),  // D SpaceType
    dropdown(ADSET_GID, 1, 60, 4, 5, ["int","lal1","lal2","crmatch","rt_checkout","rt_listing"]),  // E AudSrc
    dropdown(ADSET_GID, 1, 60, 5, 6, ["FEED-STORIES","FEED","REELS","STORIES","SEARCH","PMAX","DEMAND-GEN"]), // F Placement
    dropdown(ADSET_GID, 1, 60, 8, 9, ["become_host_click","host_onboarding_started","listing_created","ViewContent","InitiateCheckout","Purchase"]), // I OptEvent

    // Creative Builder — clear all first
    clearVal(CREAT_GID, 0, 200, 0, 20),
    // A=AdID, B=AdSetID, C=CampID → no validation
    dropdown(CREAT_GID, 1, 60, 3, 4, ["T01","T02","T03","T04","T05","T06"]),  // D TestID
    dropdown(CREAT_GID, 1, 60, 4, 5, ["A","B","C"]),                          // E Variant
    dropdown(CREAT_GID, 1, 60, 5, 6, ["income","community","idle_space","social_proof","urgency","fomo","sensory","thermal","ease","educational"]), // F Angle
    dropdown(CREAT_GID, 1, 60, 6, 7, ["Static","Video","Carousel","UGC","RSA"]), // G FormatType
    dropdown(CREAT_GID, 1, 60, 7, 8, ["NA","6s","15s","30s","60s"]),          // H Length
    dropdown(CREAT_GID, 1, 60, 8, 9, ["9:16","1:1","4:5","16:9","NA"]),       // I AspectRatio
    dropdown(CREAT_GID, 1, 60, 9, 10, ["list_now","get_started","see_how","learn_more","book_now","explore","sign_up"]), // J CTA
    // K=AdSetName formula, L=AdName formula → no validation
    dropdown(CREAT_GID, 1, 60, 13, 14, ["Live","Testing","Draft","Paused","Archived"]),  // N Status
    dropdown(CREAT_GID, 1, 60, 14, 15, ["META","GOOG","SNAP","TIKTOK"]),       // O Platform
    dropdown(CREAT_GID, 1, 60, 15, 16, ["P1","P2","P3"]),                      // P Phase
    dropdown(CREAT_GID, 1, 60, 16, 17, ["become_host_click","host_onboarding_started","listing_created","ViewContent","InitiateCheckout","Purchase"]), // Q OptEvent
  ]

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: valRequests } })
  console.log("✅ Validation applied")

  // ── 4. Formatting ────────────────────────────────────────────────────────
  // Ad Set Builder: generated col = H (index 7), ID cols = 2 (A+B)
  const adsetFmt = buildFormatRequests(ADSET_GID, ADSET_HEADERS.length, 7, 2, [
    [0,1,70],[1,2,70],[2,3,240],         // ID, CampID, CampName
    [3,4,90],[4,5,90],[5,6,110],[6,7,240],  // SpaceType, AudSrc, Placement, Details
    [7,8,370],                           // → Ad Set Name
    [8,9,170],[9,10,100],               // OptEvent, Budget
  ])

  // Creative Builder: generated col = L (index 11), ID cols = 3 (A+B+C)
  // Also tint the Ad Set Name lookup col (K, index 10) lightly
  const creativeFmt = buildFormatRequests(CREAT_GID, CREAT_HEADERS.length, 11, 3, [
    [0,1,65],[1,2,65],[2,3,65],           // IDs
    [3,4,55],[4,5,50],[5,6,105],          // TestID, Variant, Angle
    [6,7,75],[7,8,65],[8,9,75],[9,10,90], // FmtType, Length, Ratio, CTA
    [10,11,330],                          // Ad Set Name (computed)
    [11,12,400],                          // → Ad Name
    [12,13,200],[13,14,75],[14,15,65],[15,16,45],[16,17,170], // Hook, Status, Platform, Phase, OptEvent
  ])

  // Extra: tint the Ad Set Name lookup col (K=10) in Creative Builder a very light green
  const extraCreativeFmt = {
    repeatCell: {
      range: { sheetId: CREAT_GID, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 10, endColumnIndex: 11 },
      cell: { userEnteredFormat: { backgroundColor: {red:0.95,green:0.98,blue:0.95}, textFormat: { fontSize: 8, fontFamily: "Courier New" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [...adsetFmt, ...creativeFmt, extraCreativeFmt] } })
  console.log("✅ Formatting applied")
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
