import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const ID = "1yx5cxxno8Pig23Zs6GagF0EblImIUQqy1fv6e4Rfh3o"

const CAMP_ID   = 686308242
const ADSET_ID  = 603831521
const CREAT_ID  = 1466176529

// ── Helper: dropdown validation rule ────────────────────────────────────────
function dropdown(sheetId, startRow, endRow, startCol, endCol, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      rule: {
        condition: { type: "ONE_OF_LIST", values: values.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true, strict: false,
      }
    }
  }
}

// ── Helper: clear validation ──────────────────────────────────────────────────
function clearValidation(sheetId, startRow, endRow, startCol, endCol) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      rule: null
    }
  }
}

async function main() {
  console.log("\n🔧 Fixing validation + Creative Builder format columns\n")

  // ── STEP 1: Clear ALL existing validation on all three tabs ───────────────
  // Then reapply correctly so no bleed-through
  const clearAll = [
    clearValidation(CAMP_ID,  0, 200, 0, 15),
    clearValidation(ADSET_ID, 0, 200, 0, 15),
    clearValidation(CREAT_ID, 0, 200, 0, 20),
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: clearAll } })
  console.log("✅ Cleared all existing validation")

  // ── STEP 2: Reapply correct validation ───────────────────────────────────
  // Campaign Builder columns (header is row 2 = index 2, data starts row 3 = index 3)
  // Col: 0=ID, 1=Platform, 2=Phase, 3=Objective, 4=Funnel, 5=AudType, 6=AudInterest, 7=Geo, 8=Name, 9=OptEvent, 10=Priority, 11=Notes
  const campValidation = [
    // Col A (0) = Campaign ID → plain text, NO validation
    dropdown(CAMP_ID, 3, 50, 1, 2, ["META","GOOG","SNAP","TIKTOK"]),               // Platform
    dropdown(CAMP_ID, 3, 50, 2, 3, ["P1","P2","P3"]),                               // Phase
    dropdown(CAMP_ID, 3, 50, 3, 4, ["REACH","LEAD","CONV","AWARE","APP"]),          // Objective
    dropdown(CAMP_ID, 3, 50, 4, 5, ["PROSP","LAL","LAL1","LAL2","RT","CRM"]),       // Funnel
    dropdown(CAMP_ID, 3, 50, 5, 6, ["host","guest"]),                               // Audience Type
    dropdown(CAMP_ID, 3, 50, 6, 7, [                                                // Audience Interest
      "gen","sauna","hottub","coldplunge","income",
      "wellness","biohacking","checkout_rt","listing_rt"
    ]),
    dropdown(CAMP_ID, 3, 50, 7, 8, ["ALL","SEA","US","LA","SF","NYC"]),             // Geo
    dropdown(CAMP_ID, 3, 50, 9, 10, [                                               // Opt Event
      "become_host_click","host_onboarding_started","listing_created",
      "ViewContent","InitiateCheckout","Purchase"
    ]),
    dropdown(CAMP_ID, 3, 50, 10, 11, ["★","1","2","3","4"]),                        // Priority
  ]

  // Ad Set Builder columns
  // Col: 0=ID, 1=CampID, 2=CampName, 3=SpaceType, 4=AudSrc, 5=Placement, 6=Notes, 7=Name, 8=OptEvent, 9=Budget
  const adsetValidation = [
    // Col 0 (ID), 1 (Campaign ID) → plain text, NO validation
    dropdown(ADSET_ID, 3, 60, 3, 4, ["sauna","hottub","coldplunge","income","gen","all_spaces"]),  // Space Type
    dropdown(ADSET_ID, 3, 60, 4, 5, ["int","lal1","lal2","crmatch","rt_checkout","rt_listing"]),  // Audience Src
    dropdown(ADSET_ID, 3, 60, 5, 6, ["FEED-STORIES","FEED","REELS","STORIES","SEARCH","PMAX","DEMAND-GEN"]), // Placement
    dropdown(ADSET_ID, 3, 60, 8, 9, [                                               // Opt Event
      "become_host_click","host_onboarding_started","listing_created",
      "ViewContent","InitiateCheckout","Purchase"
    ]),
  ]

  // Creative Builder — NEW column layout with split format:
  // Col: 0=AdID, 1=AdSetID, 2=CampID, 3=TestID, 4=Variant, 5=Angle, 6=FormatType, 7=Length, 8=AspectRatio, 9=CTA, 10=AdName, 11=Hook, 12=Status, 13=Platform, 14=Phase, 15=OptEvent
  const creativeValidation = [
    // Col 0,1,2 (IDs) → plain text, NO validation
    dropdown(CREAT_ID, 3, 60, 4, 5, ["A","B","C"]),                                // Variant
    dropdown(CREAT_ID, 3, 60, 5, 6, [                                              // Angle
      "income","community","idle_space","social_proof","urgency","fomo",
      "sensory","thermal","ease","thermal","educational"
    ]),
    dropdown(CREAT_ID, 3, 60, 6, 7, ["Static","Video","Carousel","UGC","RSA"]),    // Format Type
    dropdown(CREAT_ID, 3, 60, 7, 8, ["NA","6s","15s","30s","60s"]),               // Length
    dropdown(CREAT_ID, 3, 60, 8, 9, ["9:16","1:1","4:5","16:9","NA"]),            // Aspect Ratio
    dropdown(CREAT_ID, 3, 60, 9, 10, [                                             // CTA
      "list_now","get_started","see_how","learn_more","book_now","explore","sign_up"
    ]),
    dropdown(CREAT_ID, 3, 60, 12, 13, ["Live","Testing","Draft","Paused","Archived"]), // Status
    dropdown(CREAT_ID, 3, 60, 13, 14, ["META","GOOG","SNAP","TIKTOK"]),            // Platform
    dropdown(CREAT_ID, 3, 60, 14, 15, ["P1","P2","P3"]),                           // Phase
    dropdown(CREAT_ID, 3, 60, 15, 16, [                                            // Opt Event
      "become_host_click","host_onboarding_started","listing_created",
      "ViewContent","InitiateCheckout","Purchase"
    ]),
  ]

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: {
    requests: [...campValidation, ...adsetValidation, ...creativeValidation]
  }})
  console.log("✅ Validation reapplied correctly")

  // ── STEP 3: Rebuild Creative Builder with split format columns ────────────
  // New headers: split Format into FormatType | Length | Aspect Ratio
  const NEW_CREAT_HEADERS = [
    "Ad ID", "Ad Set ID", "Campaign ID",
    "Test ID", "Variant", "Angle",
    "Format Type",    // Static | Video | Carousel | UGC | RSA
    "Length",         // NA | 6s | 15s | 30s | 60s
    "Aspect Ratio",   // 9:16 | 1:1 | 4:5 | 16:9 | NA
    "CTA",
    "→ Ad Name",
    "Hook Copy (first 3 words)", "Status", "Platform", "Phase", "Opt. Event",
  ]

  // Format split map: old combined → [FormatType, Length, AspectRatio]
  const FORMAT_SPLIT = {
    "Static_9x16":  ["Static",   "NA",  "9:16"],
    "Static_1x1":   ["Static",   "NA",  "1:1"],
    "Static_4x5":   ["Static",   "NA",  "4:5"],
    "Video_15s":    ["Video",    "15s", "9:16"],
    "Video_30s":    ["Video",    "30s", "9:16"],
    "Video_6s":     ["Video",    "6s",  "9:16"],
    "Carousel":     ["Carousel", "NA",  "1:1"],
    "UGC":          ["UGC",      "NA",  "9:16"],
    "RSA":          ["RSA",      "NA",  "NA"],
    "Static_1x1_listNow": ["Static","NA","1:1"],
  }

  // Map ADSETS data (same as rebuild script) to get ad set names
  const ADSETS = [
    ["AS001","C001","META_P1_REACH_PROSP_host_gen_ALL",   "sauna",    "int",       "FEED-STORIES"],
    ["AS002","C001","META_P1_REACH_PROSP_host_gen_ALL",   "hottub",   "int",       "FEED-STORIES"],
    ["AS003","C001","META_P1_REACH_PROSP_host_gen_ALL",   "coldplunge","int",      "FEED-STORIES"],
    ["AS004","C001","META_P1_REACH_PROSP_host_gen_ALL",   "income",   "int",       "FEED-STORIES"],
    ["AS005","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "sauna",    "lal1",      "FEED-STORIES"],
    ["AS006","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "income",   "lal1",      "FEED-STORIES"],
    ["AS007","C003","META_P2_LEAD_PROSP_host_gen_ALL",    "sauna",    "lal2",      "FEED-STORIES"],
    ["AS008","C005","META_P3_CONV_LAL_host_gen_ALL",      "sauna",    "lal2",      "FEED-STORIES"],
    ["AS009","C005","META_P3_CONV_LAL_host_gen_ALL",      "income",   "lal2",      "FEED-STORIES"],
    ["AS010","C007","GOOG_P1_CONV_PROSP_host_gen_SEA",    "income",   "int",       "SEARCH"],
    ["AS011","C010","META_P3_CONV_RT_guest_checkout_rt_ALL","all_spaces","rt_checkout","FEED-STORIES"],
    ["AS012","C010","META_P3_CONV_RT_guest_checkout_rt_ALL","sauna",  "rt_checkout","FEED-STORIES"],
    ["AS013","C011","META_P2_CONV_RT_guest_listing_rt_ALL","all_spaces","rt_listing","FEED-STORIES"],
    ["AS014","C012","META_P1_CONV_PROSP_guest_wellness_ALL","gen",    "int",       "FEED-STORIES"],
    ["AS015","C013","META_P1_CONV_PROSP_guest_biohacking_ALL","gen",  "int",       "FEED-STORIES"],
    ["AS016","C014","GOOG_P3_CONV_RT_guest_checkout_rt_ALL","all_spaces","rt_checkout","SEARCH"],
    ["AS017","C015","GOOG_P1_CONV_PROSP_guest_wellness_SEA","gen",    "int",       "DEMAND-GEN"],
  ]
  const adsetNameMap = {}
  ADSETS.forEach(a => {
    adsetNameMap[a[0]] = `${a[2]}_${a[3]}_${a[4]}_${a[5]}`
  })

  // Creatives with original format → split
  const CREATIVES_RAW = [
    ["AD001","AS001","C001","T01","A","income",      "Static_9x16","list_now", "Your sauna sits empty 6 days…","Live",   "META","P1","become_host_click"],
    ["AD002","AS001","C001","T01","B","community",   "Static_9x16","list_now", "Join 200+ hosts sharing…",     "Testing","META","P1","become_host_click"],
    ["AD003","AS002","C001","T01","A","idle_space",  "Static_9x16","list_now", "Hot tub on → guests off →…",   "Live",   "META","P1","become_host_click"],
    ["AD004","AS002","C001","T01","B","income",      "Video_15s",  "list_now", "$400/month. Same hot tub.",     "Testing","META","P1","become_host_click"],
    ["AD005","AS010","C007","T01","A","income",      "RSA",        "list_now", "Earn from your sauna today",   "Live",   "GOOG","P1","become_host_click"],
    ["AD006","AS005","C003","T02","A","idle_space",  "Video_15s",  "get_started","Setup takes 10 minutes…",    "Draft",  "META","P2","host_onboarding_started"],
    ["AD007","AS005","C003","T02","B","social_proof","Carousel",   "get_started","See what hosts earn…",        "Draft",  "META","P2","host_onboarding_started"],
    ["AD008","AS006","C003","T02","A","community",   "Static_9x16","get_started","Your space. Your rules.",     "Draft",  "META","P2","host_onboarding_started"],
    ["AD009","AS008","C005","T03","A","social_proof","Static_9x16","list_now", "First booking in 48 hrs",      "Draft",  "META","P3","listing_created"],
    ["AD010","AS008","C005","T03","B","urgency",     "Video_30s",  "list_now", "Limited spots in Seattle",     "Draft",  "META","P3","listing_created"],
    ["AD011","AS009","C005","T03","A","social_proof","UGC",        "list_now", "I listed mine last week…",     "Draft",  "META","P3","listing_created"],
    ["AD012","AS011","C010","T04","A","fomo",        "Static_9x16","book_now", "You were this close…",         "Draft",  "META","P3","Purchase"],
    ["AD013","AS011","C010","T04","B","urgency",     "Video_15s",  "book_now", "Only 3 spots left this week",  "Draft",  "META","P3","Purchase"],
    ["AD014","AS012","C010","T04","A","social_proof","UGC",        "book_now", '"Warmest hour of my week"',    "Draft",  "META","P3","Purchase"],
    ["AD015","AS013","C011","T04","A","ease",        "Carousel",   "book_now", "Browse → book in 2 mins",      "Draft",  "META","P2","InitiateCheckout"],
    ["AD016","AS013","C011","T04","B","social_proof","Static_9x16","book_now", "4.9 ★ across 50+ sessions",   "Draft",  "META","P2","InitiateCheckout"],
    ["AD017","AS014","C012","T05","A","sensory",     "Video_30s",  "explore",  "Heat. Steam. Silence.",        "Draft",  "META","P1","ViewContent"],
    ["AD018","AS014","C012","T05","B","community",   "Static_9x16","explore",  "Your neighbourhood sauna →",  "Draft",  "META","P1","ViewContent"],
    ["AD019","AS015","C013","T05","A","thermal",     "Video_15s",  "explore",  "Cold plunge. Hot sauna. Repeat.","Draft","META","P1","ViewContent"],
    ["AD020","AS015","C013","T05","B","social_proof","Static_9x16","explore",  "The recovery protocol →",      "Draft",  "META","P1","ViewContent"],
  ]

  const dataRows = []
  let lastAsId = "", lastCId = ""
  for (const ad of CREATIVES_RAW) {
    const [adId, asId, cId, testId, variant, angle, fmtRaw, cta, hook, status, platform, phase, optEvent] = ad
    // Insert section break when campaign changes from host to guest
    if (cId >= "C010" && lastCId < "C010" && lastCId !== "") {
      dataRows.push(["","","","","","──── GUEST CREATIVES ────","","","","","","","","","",""])
    } else if (asId !== lastAsId && lastAsId !== "") {
      dataRows.push(["","","","","","","","","","","","","","","",""])
    }
    lastAsId = asId; lastCId = cId

    const [fmtType, length, ratio] = FORMAT_SPLIT[fmtRaw] ?? [fmtRaw, "NA", "NA"]
    const asName = adsetNameMap[asId] ?? asId
    // Ad name uses abbreviated format: {AsName}_{TestID}_{Variant}_{Angle}_{FmtType}_{Length}_{Ratio}_{CTA}
    const adNameSuffix = `${testId}_${variant}_${angle}_${fmtType}${length !== "NA" ? "_"+length : ""}_${ratio !== "NA" ? ratio : ""}_${cta}`.replace(/_+/g,"_").replace(/_$/,"")
    const adName = `${asName}_${adNameSuffix}`

    dataRows.push([adId, asId, cId, testId, variant, angle, fmtType, length, ratio, cta, adName, hook, status, platform, phase, optEvent])
  }

  // Write the rebuilt Creative Builder
  const rows = [
    ["thrml — Creative Builder  |  Ad ID + Ad Set ID + Campaign ID cross-reference all tabs. Format split into Type / Length / Aspect Ratio.","","","","","","","","","","","","","","",""],
    ["Ad ID = AD###  |  → Ad Name auto-generated. Dropdowns validated — IDs are plain text.","","","","","","","","","","","","","","",""],
    NEW_CREAT_HEADERS,
    ["","","","","","──── HOST CREATIVES ────","","","","","","","","","",""],
    ...dataRows,
  ]

  await sheets.spreadsheets.values.clear({ spreadsheetId: ID, range: "'④ Creative Builder'!A1:Z100" })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID, range: "'④ Creative Builder'!A1",
    valueInputOption: "RAW", requestBody: { values: rows }
  })
  console.log(`✅ Creative Builder rebuilt — ${dataRows.length} ad rows, format split into 3 columns`)

  // ── STEP 4: Format the Creative Builder tab ─────────────────────────────
  const dark  = {red:0.102,green:0.078,blue:0.063}
  const white = {red:1,green:1,blue:1}
  const green = {red:0.851,green:0.918,blue:0.827}
  const gray  = {red:0.93,green:0.93,blue:0.93}

  const hdr = (row, cols, bg, fg) => ({ repeatCell: {
    range: { sheetId: CREAT_ID, startRowIndex: row, endRowIndex: row+1, startColumnIndex: 0, endColumnIndex: cols },
    cell: { userEnteredFormat: { backgroundColor: bg, textFormat: { foregroundColor: fg, bold: true, fontSize: 10 }, verticalAlignment: "MIDDLE", padding: { top: 6, bottom: 6 } } },
    fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)"
  }})
  const cw = (s, e, px) => ({ updateDimensionProperties: {
    range: { sheetId: CREAT_ID, dimension: "COLUMNS", startIndex: s, endIndex: e },
    properties: { pixelSize: px }, fields: "pixelSize"
  }})

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [
    { updateSheetProperties: { properties: { sheetId: CREAT_ID, gridProperties: { frozenRowCount: 3 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: {
      range: { sheetId: CREAT_ID, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 16 },
      cell: { userEnteredFormat: { backgroundColor: {red:0.15,green:0.12,blue:0.10}, textFormat: { foregroundColor: white, italic: true, fontSize: 9 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    hdr(2, 16, dark, white),
    // ID columns: monospace tint
    { repeatCell: {
      range: { sheetId: CREAT_ID, startRowIndex: 3, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 3 },
      cell: { userEnteredFormat: { backgroundColor: {red:0.95,green:0.95,blue:1.0}, textFormat: { bold: true, fontSize: 9, fontFamily: "Courier New" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // → Ad Name col (10): green monospace
    { repeatCell: {
      range: { sheetId: CREAT_ID, startRowIndex: 3, endRowIndex: 100, startColumnIndex: 10, endColumnIndex: 11 },
      cell: { userEnteredFormat: { backgroundColor: green, textFormat: { fontSize: 8, fontFamily: "Courier New" } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // New format columns (6,7,8) get a light amber tint to show they're related
    { repeatCell: {
      range: { sheetId: CREAT_ID, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 6, endColumnIndex: 9 },
      cell: { userEnteredFormat: { backgroundColor: {red:1,green:0.85,blue:0.4}, textFormat: { foregroundColor: dark, bold: true, fontSize: 10 } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)"
    }},
    // Column widths
    cw(0,1,65), cw(1,2,65), cw(2,3,65),                  // IDs
    cw(3,4,55), cw(4,5,55), cw(5,6,105),                  // TestID, Variant, Angle
    cw(6,7,75), cw(7,8,65), cw(8,9,75), cw(9,10,85),     // FormatType, Length, Ratio, CTA
    cw(10,11,390),                                          // → Ad Name
    cw(11,12,200), cw(12,13,70), cw(13,14,65), cw(14,15,45), cw(15,16,170), // Hook, Status, Platform, Phase, OptEvent
  ]}})
  console.log("✅ Creative Builder formatting applied")
  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
