/**
 * Build "Performance Report" + "Ad Performance" tabs in the Finance Tracker
 * All metrics pull live from Platform Data via SUMIF formulas
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── Platform Data column letters (A=0) ────────────────────────────────────
// E=Platform F=CampID G=AsID H=AdID I=CampName J=AsName K=AdName
// L=Phase M=CampObj N=FunnelStage O=AudGroup P=TgtName Q=Geo
// R=SpaceType S=TgtTactic T=Placement U=Angle V=FmtType W=Length
// X=Ratio Y=CTA Z=Hook AA=OptEvent
// AB=Spend AC=Imps AD=Reach AE=Clicks AF=BHC AG=HOS AH=LC AI=Pur AJ=VV100

// Metric column letters
const M = { spend:"AB", imps:"AC", reach:"AD", clicks:"AE",
            bhc:"AF", hos:"AG", lc:"AH", pur:"AI", vv100:"AJ" }

// SUMIF referencing Platform Data
const sumif = (dimCol, dimVal, metricCol) =>
  `=IFERROR(SUMIF('Platform Data'!${dimCol}:${dimCol},"${dimVal}",'Platform Data'!${metricCol}:${metricCol}),0)`

const sumifTotal = (metricCol) =>
  `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!${metricCol}2:${metricCol}10000)*('Platform Data'!${metricCol}2:${metricCol}10000)),0)`

// Dollar format helper
const d = (col, row) => `=TEXT(${col}${row},"$#,##0.00")`

// ── Metric column headers ─────────────────────────────────────────────────
const METRIC_HDRS = [
  "Spend ($)", "Impressions", "Link Clicks",
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  "Video Views 100%",
]
const METRIC_COLS = [M.spend, M.imps, M.clicks, M.bhc, M.hos, M.lc, M.pur, M.vv100]

// ── Colour palette ─────────────────────────────────────────────────────────
const C = {
  dark:      { red:0.102, green:0.078, blue:0.063 },
  white:     { red:1,     green:1,     blue:1     },
  sectionBg: { red:0.149, green:0.196, blue:0.278 }, // deep navy for section headers
  hdrBg:     { red:0.220, green:0.290, blue:0.400 }, // mid-navy for column headers
  totalBg:   { red:0.067, green:0.067, blue:0.067 }, // near-black for totals
  rowOdd:    { red:0.969, green:0.973, blue:0.984 }, // very light blue for odd rows
  rowEven:   { red:1,     green:1,     blue:1     },
  titleBg:   { red:0.078, green:0.114, blue:0.169 }, // darkest navy for report title
}

// ── Section builder ────────────────────────────────────────────────────────
// Returns array of row arrays + formatting request data
// startRow: 1-based sheet row where this section begins
function buildSection(label, emoji, dimCol, dimValues, startRow) {
  const rows = []

  // Section title row (spans full width)
  rows.push([`${emoji}  BY ${label.toUpperCase()}`, ...Array(8).fill("")])
  // Column header row
  rows.push(["Dimension", ...METRIC_HDRS])

  // Data rows
  for (const val of dimValues) {
    rows.push([
      val,
      ...METRIC_COLS.map(mc => sumif(dimCol, val, mc)),
    ])
  }

  // Totals row
  rows.push([
    "TOTAL",
    ...METRIC_COLS.map(mc => sumifTotal(mc)),
  ])

  // Blank spacer
  rows.push(Array(9).fill(""))

  return rows
}

// ── Performance Report tab content ─────────────────────────────────────────
function buildPerformanceReport() {
  const allRows = []

  // Report title (row 1)
  allRows.push(["thrml — Master Performance Report", ...Array(8).fill("")])
  // "As of" date (row 2) — plain text, no formula
  allRows.push([`=TEXT(TODAY(),"As of Mmmm D, YYYY")`, ...Array(8).fill("")])
  // Spacer (row 3)
  allRows.push(Array(9).fill(""))

  // ── Sections ───────────────────────────────────────────────────────────
  // Pull unique values from known data (matches what's in Platform Data)
  const sections = [
    { label:"Platform",     emoji:"🖥",  col:"E",  vals:["Meta","Google"] },
    { label:"Phase",        emoji:"📋",  col:"L",  vals:["P1","P2","P3"] },
    { label:"Funnel Stage", emoji:"🎯",  col:"N",  vals:["Prospecting","Lookalike","Retargeting"] },
    { label:"Audience Group", emoji:"👥", col:"O", vals:["Host","Guest"] },
    { label:"Format Type",  emoji:"🎨",  col:"V",  vals:["Static","Video","Carousel","UGC","RSA"] },
  ]

  let currentRow = 4 // 1-based, rows 1-3 used above
  const sectionMeta = [] // track where each section lands for formatting

  for (const sec of sections) {
    const rows = buildSection(sec.label, sec.emoji, sec.col, sec.vals, currentRow)
    sectionMeta.push({
      label: sec.label,
      titleRow: currentRow,        // section title (0-based = currentRow-1)
      hdrRow: currentRow + 1,      // column header row
      dataStart: currentRow + 2,   // first data row
      dataEnd: currentRow + 1 + sec.vals.length, // last data row (inclusive)
      totalRow: currentRow + 2 + sec.vals.length, // TOTAL row
      endRow: currentRow + rows.length, // last row of this section (inclusive)
    })
    allRows.push(...rows)
    currentRow += rows.length
  }

  // Campaign section — read unique campaign names via UNIQUE formula
  // Use static list from what we know is in the data
  const campaignVals = [
    "C001_META_P1_PROSP_REACH_BH_host_SEA",
    "C002_META_P1_PROSP_REACH_BH_host_SEA",
    "C003_META_P2_PROSP_LEAD_HO_host_SEA",
    "C004_META_P2_LAL_LEAD_HO_host_SEA",
    "C005_META_P3_LAL_CONV_NL_host_SEA",
    "C006_META_P3_LAL_CONV_NL_host_SEA",
    "C007_GOOG_P1_PROSP_CONV_BH_host_SEA",
    "C008_GOOG_P2_PROSP_CONV_HO_host_SEA",
    "C009_GOOG_P3_PROSP_CONV_NL_host_SEA",
    "C010_META_P2_RT_CONV_IC_guest_SEA",
    "C011_META_P1_PROSP_CONV_VC_guest_SEA",
    "C012_META_P1_PROSP_CONV_VC_guest_SEA",
    "C013_GOOG_P3_RT_CONV_PUR_guest_SEA",
    "C014_GOOG_P1_PROSP_CONV_VC_guest_SEA",
  ]
  // For Campaign section, dim col is I (Campaign Name)
  const campRows = buildSection("Campaign", "📣", "I", campaignVals, currentRow)
  sectionMeta.push({
    label: "Campaign",
    titleRow: currentRow,
    hdrRow: currentRow + 1,
    dataStart: currentRow + 2,
    dataEnd: currentRow + 1 + campaignVals.length,
    totalRow: currentRow + 2 + campaignVals.length,
    endRow: currentRow + campRows.length,
  })
  allRows.push(...campRows)

  return { allRows, sectionMeta }
}

// ── Ad Performance tab content ─────────────────────────────────────────────
function buildAdPerformance() {
  // Header + formula rows pulling from Platform Data grouped by Ad ID
  // We use SUMIF on Ad ID (col H) for each ad
  const adIds = [
    "AD001","AD002","AD003","AD004","AD005","AD006","AD007","AD008","AD009","AD010",
    "AD011","AD012","AD013","AD014","AD015","AD016","AD017","AD018",
  ]

  const headers = [
    "Ad ID", "Campaign ID", "Ad Set ID", "Ad Name",
    "Phase", "Audience Group", "Targeting Name", "Format Type", "Angle", "CTA",
    ...METRIC_HDRS,
  ]

  // For each ad, look up metadata via INDEX/MATCH on Platform Data col H (Ad ID)
  const im = (lookupCol) =>
    `=IFERROR(INDEX('Platform Data'!${lookupCol}:${lookupCol},MATCH(A{R},'Platform Data'!H:H,0)),"")`

  const rows = [headers]
  for (const adId of adIds) {
    const r_placeholder = "{R}" // will be replaced with actual row number
    const rowNum = rows.length + 1 // 1-based
    const meta = (col) => `=IFERROR(INDEX('Platform Data'!${col}:${col},MATCH(A${rowNum},'Platform Data'!H:H,0)),"")`
    rows.push([
      adId,
      meta("F"),  // Campaign ID
      meta("G"),  // Ad Set ID
      meta("K"),  // Ad Name
      meta("L"),  // Phase
      meta("O"),  // Audience Group
      meta("P"),  // Targeting Name
      meta("V"),  // Format Type
      meta("U"),  // Angle
      meta("Y"),  // CTA
      // Metrics via SUMIF on Ad ID
      ...METRIC_COLS.map(mc => `=IFERROR(SUMIF('Platform Data'!H:H,A${rowNum},'Platform Data'!${mc}:${mc}),0)`),
    ])
  }

  // Totals row
  const lastDataRow = rows.length
  const firstDataRow = 2
  const totalsRow = ["TOTAL", "", "", "", "", "", "", "", "", ""]
  for (const mc of METRIC_COLS) {
    totalsRow.push(`=IFERROR(SUMIF('Platform Data'!A:A,"<>",'Platform Data'!${mc}:${mc}),0)`)
  }
  rows.push(totalsRow)

  return rows
}

// ── Format request builders ───────────────────────────────────────────────
function rng(sid, r1, r2, c1, c2) {
  return { sheetId:sid, startRowIndex:r1, endRowIndex:r2, startColumnIndex:c1, endColumnIndex:c2 }
}
function bgFmt(sid, r1, r2, c1, c2, bg, text={}) {
  return { repeatCell: { range: rng(sid,r1,r2,c1,c2),
    cell: { userEnteredFormat: { backgroundColor:bg, textFormat:text } },
    fields: "userEnteredFormat(backgroundColor,textFormat)" } }
}
function border(sid, r1, r2, c1, c2, style="SOLID", color={red:0.8,green:0.8,blue:0.8}) {
  return { updateBorders: { range: rng(sid,r1,r2,c1,c2),
    bottom: { style, color }, top: { style, color }, left: { style, color }, right: { style, color } } }
}
function cw(sid, s, e, px) {
  return { updateDimensionProperties: {
    range: { sheetId:sid, dimension:"COLUMNS", startIndex:s, endIndex:e },
    properties: { pixelSize:px }, fields:"pixelSize" } }
}
function rh(sid, s, e, px) {
  return { updateDimensionProperties: {
    range: { sheetId:sid, dimension:"ROWS", startIndex:s, endIndex:e },
    properties: { pixelSize:px }, fields:"pixelSize" } }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🏗  Building Performance Report + Ad Performance tabs\n")

  // 1. Fetch current tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabMap = Object.fromEntries(meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))

  // 2. Add/clear tabs
  const addRequests = []
  for (const tabName of ["Performance Report", "Ad Performance"]) {
    if (!tabMap[tabName]) {
      addRequests.push({ addSheet: { properties: { title: tabName } } })
    }
  }
  if (addRequests.length) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID, requestBody:{ requests:addRequests } })
    r.data.replies.forEach(rep => {
      if (rep.addSheet) tabMap[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId
    })
  }
  const prSid = tabMap["Performance Report"]
  const apSid = tabMap["Ad Performance"]

  // ── PERFORMANCE REPORT ─────────────────────────────────────────────────
  const { allRows, sectionMeta } = buildPerformanceReport()
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER_ID, range:"'Performance Report'!A1:Z500" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER_ID, range:"'Performance Report'!A1",
    valueInputOption:"USER_ENTERED", requestBody:{ values:allRows },
  })
  console.log(`✅ Performance Report data: ${allRows.length} rows`)

  // ── Format Performance Report ──────────────────────────────────────────
  const NUM_COLS = 9 // Dimension + 8 metrics
  const prFmtReqs = [
    { updateSheetProperties: { properties:{ sheetId:prSid, gridProperties:{ frozenRowCount:3, frozenColumnCount:1 } }, fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
    // Title row (row 0)
    { repeatCell: { range: rng(prSid,0,1,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.titleBg,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:16 },
        verticalAlignment:"MIDDLE", padding:{ top:12, bottom:12 } } },
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)" } },
    // "As of" row (row 1) — right-aligned italic
    { repeatCell: { range: rng(prSid,1,2,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.titleBg,
        textFormat:{ foregroundColor:{ red:0.7,green:0.7,blue:0.7 }, italic:true, fontSize:9 },
        horizontalAlignment:"RIGHT" } },
      fields:"userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)" } },
    // Spacer row (row 2)
    { repeatCell: { range: rng(prSid,2,3,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.dark } },
      fields:"userEnteredFormat(backgroundColor)" } },
    // Title row height
    rh(prSid,0,1,44),
    rh(prSid,1,2,22),
    rh(prSid,2,3,6),
    // Column widths
    cw(prSid,0,1,280), // Dimension
    cw(prSid,1,2,100), // Spend
    cw(prSid,2,3,110), // Impressions
    cw(prSid,3,4,100), // Link Clicks
    cw(prSid,4,5,130), // BHC
    cw(prSid,5,6,155), // HOS
    cw(prSid,6,7,120), // LC
    cw(prSid,7,8,90),  // Purchase
    cw(prSid,8,9,120), // VV100
  ]

  // Section formatting
  for (const sec of sectionMeta) {
    const tr = sec.titleRow - 1   // 0-based
    const hr = sec.hdrRow - 1
    const ds = sec.dataStart - 1
    const de = sec.dataEnd        // exclusive
    const tot = sec.totalRow - 1

    // Section title row — deep navy
    prFmtReqs.push({ repeatCell: { range: rng(prSid,tr,tr+1,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.sectionBg,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:11 },
        verticalAlignment:"MIDDLE", padding:{ top:8, bottom:8 } } },
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)" } })
    rh(prSid,tr,tr+1,32)

    // Column header row — mid-navy
    prFmtReqs.push({ repeatCell: { range: rng(prSid,hr,hr+1,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.hdrBg,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:10 },
        verticalAlignment:"MIDDLE", padding:{ top:5, bottom:5 },
        horizontalAlignment:"CENTER" } },
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding,horizontalAlignment)" } })
    // Dimension header left-aligned
    prFmtReqs.push({ repeatCell: { range: rng(prSid,hr,hr+1,0,1),
      cell: { userEnteredFormat: { horizontalAlignment:"LEFT" } },
      fields:"userEnteredFormat(horizontalAlignment)" } })

    // Data rows — alternating
    for (let r = ds; r < de; r++) {
      const bg = (r - ds) % 2 === 0 ? C.rowOdd : C.rowEven
      prFmtReqs.push({ repeatCell: { range: rng(prSid,r,r+1,0,NUM_COLS),
        cell: { userEnteredFormat: { backgroundColor:bg, textFormat:{ fontSize:10 } } },
        fields:"userEnteredFormat(backgroundColor,textFormat)" } })
      // Metrics right-aligned
      prFmtReqs.push({ repeatCell: { range: rng(prSid,r,r+1,1,NUM_COLS),
        cell: { userEnteredFormat: { horizontalAlignment:"RIGHT" } },
        fields:"userEnteredFormat(horizontalAlignment)" } })
    }

    // Totals row — near-black bold
    prFmtReqs.push({ repeatCell: { range: rng(prSid,tot,tot+1,0,NUM_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.totalBg,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:10 },
        horizontalAlignment:"RIGHT" } },
      fields:"userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)" } })
    prFmtReqs.push({ repeatCell: { range: rng(prSid,tot,tot+1,0,1),
      cell: { userEnteredFormat: { horizontalAlignment:"LEFT" } },
      fields:"userEnteredFormat(horizontalAlignment)" } })
    prFmtReqs.push(border(prSid,tot,tot+1,0,NUM_COLS,"SOLID_THICK",{red:0.5,green:0.5,blue:0.5}))
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID, requestBody:{ requests:prFmtReqs } })
  console.log("✅ Performance Report formatted")

  // ── AD PERFORMANCE ────────────────────────────────────────────────────
  const apRows = buildAdPerformance()
  await sheets.spreadsheets.values.clear({ spreadsheetId:MASTER_ID, range:"'Ad Performance'!A1:Z100" })
  await sheets.spreadsheets.values.update({
    spreadsheetId:MASTER_ID, range:"'Ad Performance'!A1",
    valueInputOption:"USER_ENTERED", requestBody:{ values:apRows },
  })

  const AP_COLS = apRows[0].length
  const apFmtReqs = [
    { updateSheetProperties: { properties:{ sheetId:apSid, gridProperties:{ frozenRowCount:1, frozenColumnCount:1 } }, fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
    // Header row
    { repeatCell: { range: rng(apSid,0,1,0,AP_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.dark,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:10 },
        verticalAlignment:"MIDDLE", padding:{ top:6, bottom:6 } } },
      fields:"userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)" } },
    // Totals row
    { repeatCell: { range: rng(apSid,apRows.length-1,apRows.length,0,AP_COLS),
      cell: { userEnteredFormat: { backgroundColor:C.totalBg,
        textFormat:{ foregroundColor:C.white, bold:true, fontSize:10 } } },
      fields:"userEnteredFormat(backgroundColor,textFormat)" } },
    // Data rows alternating
    ...Array.from({ length: apRows.length - 2 }, (_, i) => ({
      repeatCell: { range: rng(apSid,i+1,i+2,0,AP_COLS),
        cell: { userEnteredFormat: { backgroundColor: i%2===0 ? C.rowOdd : C.rowEven, textFormat:{ fontSize:9 } } },
        fields:"userEnteredFormat(backgroundColor,textFormat)" }
    })),
    // Column widths
    cw(apSid,0,1,65),   // Ad ID
    cw(apSid,1,2,75),   // Campaign ID
    cw(apSid,2,3,75),   // Ad Set ID
    cw(apSid,3,4,175),  // Ad Name
    cw(apSid,4,5,50),   // Phase
    cw(apSid,5,6,80),   // Audience Group
    cw(apSid,6,7,170),  // Targeting Name
    cw(apSid,7,8,80),   // Format Type
    cw(apSid,8,9,110),  // Angle
    cw(apSid,9,10,90),  // CTA
    cw(apSid,10,AP_COLS,85), // Metrics
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER_ID, requestBody:{ requests:apFmtReqs } })
  console.log(`✅ Ad Performance formatted (${apRows.length - 1} ad rows + totals)`)

  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
