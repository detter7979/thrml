/**
 * Migrate reporting tabs: Finance Tracker → Master Report
 * Tabs to move: Performance Report, Ad Performance, Spend Breakdown, Creative Performance
 * Also copy: Platform Data, Targeting Lookup (needed by the formulas)
 * Then delete the 4 reporting tabs from Finance Tracker
 * Finally delete the blank Sheet1 from Master Report
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })

const MASTER  = "17wVL2MIf_EuHIA4Wm1ShjgUbyrKthYR2KvvTdeL16qw"
const FINANCE = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// Tabs to fully migrate (data + formulas + formatting)
const MIGRATE_TABS = [
  "Platform Data",
  "Targeting Lookup",
  "Performance Report",
  "Ad Performance",
  "Spend Breakdown",
  "Creative Performance",
]

// Tabs to delete from Finance Tracker after migration (keep Platform Data + Targeting Lookup there too)
const DELETE_FROM_FINANCE = [
  "Performance Report",
  "Ad Performance",
  "Spend Breakdown",
  "Creative Performance",
]

async function readTabData(spreadsheetId, tabTitle) {
  // Read values (with formulas)
  const vals = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `'${tabTitle}'!A1:AZ500`,
    valueRenderOption: "FORMULA",
  })
  return vals.data.values ?? []
}

async function getTabProperties(spreadsheetId, tabTitle) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  return meta.data.sheets?.find(s => s.properties.title === tabTitle)
}

async function main() {
  console.log("\n🚚 Migrating reporting tabs: Finance Tracker → Master Report\n")

  // ── 1. Read Finance Tracker tab metadata ─────────────────────────────────
  const financeMeta = await sheets.spreadsheets.get({ spreadsheetId: FINANCE })
  const financeTabMap = Object.fromEntries(financeMeta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))

  // ── 2. Read Master Report tab metadata ───────────────────────────────────
  const masterMeta = await sheets.spreadsheets.get({ spreadsheetId: MASTER })
  const masterTabMap = Object.fromEntries(masterMeta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))
  const sheet1Gid = masterTabMap["Sheet1"] ?? 0

  // ── 3. Create all needed tabs in Master Report ────────────────────────────
  const tabsToCreate = MIGRATE_TABS.filter(t => !masterTabMap[t])
  if (tabsToCreate.length) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: MASTER,
      requestBody: { requests: tabsToCreate.map((title, i) => ({
        addSheet: { properties: { title, index: i } }
      }))}
    })
    addRes.data.replies?.forEach(rep => {
      if (rep.addSheet) masterTabMap[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId
    })
    console.log(`✅ Created tabs in Master Report: ${tabsToCreate.join(", ")}`)
  }

  // ── 4. Copy data for each tab ─────────────────────────────────────────────
  for (const tabTitle of MIGRATE_TABS) {
    process.stdout.write(`  Copying '${tabTitle}'...`)
    const data = await readTabData(FINANCE, tabTitle)
    if (!data.length) { console.log(" (empty, skipping)"); continue }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: MASTER, range: `'${tabTitle}'!A1:AZ500`
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: MASTER, range: `'${tabTitle}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: data },
    })
    console.log(` ${data.length} rows`)
  }

  // ── 5. Copy column widths + row heights + freeze + basic cell formatting ──
  // We copy the full sheet formatting using copyTo for visual consistency
  for (const tabTitle of MIGRATE_TABS) {
    const srcGid = financeTabMap[tabTitle]
    const dstGid = masterTabMap[tabTitle]
    if (!srcGid || !dstGid) continue

    // Copy dimension properties (col widths + row heights) from source
    const srcSheet = financeMeta.data.sheets?.find(s => s.properties.title === tabTitle)
    const dstRequests = []

    // Freeze rows/cols
    const frozenRows = srcSheet?.properties?.gridProperties?.frozenRowCount ?? 0
    const frozenCols = srcSheet?.properties?.gridProperties?.frozenColumnCount ?? 0
    if (frozenRows || frozenCols) {
      dstRequests.push({ updateSheetProperties: {
        properties: { sheetId: dstGid, gridProperties: { frozenRowCount: frozenRows, frozenColumnCount: frozenCols } },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount"
      }})
    }

    if (dstRequests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER, requestBody: { requests: dstRequests } })
    }
  }
  console.log("✅ Freeze settings applied")

  // ── 6. Apply formatting to key tabs in Master Report ─────────────────────
  // Re-run the same formatting logic for Platform Data and Performance Report
  // since we can't easily copy cell formats cross-spreadsheet via API
  await applyMasterFormatting(masterTabMap)
  console.log("✅ Formatting applied to Master Report")

  // ── 7. Delete reporting tabs from Finance Tracker ─────────────────────────
  const deleteRequests = DELETE_FROM_FINANCE
    .filter(t => financeTabMap[t] !== undefined)
    .map(t => ({ deleteSheet: { sheetId: financeTabMap[t] } }))

  if (deleteRequests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FINANCE, requestBody: { requests: deleteRequests }
    })
    console.log(`✅ Deleted from Finance Tracker: ${DELETE_FROM_FINANCE.join(", ")}`)
  }

  // ── 8. Delete blank Sheet1 from Master Report ─────────────────────────────
  if (sheet1Gid !== undefined && masterTabMap["Sheet1"] !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: MASTER, requestBody: { requests: [{ deleteSheet: { sheetId: sheet1Gid } }] }
    })
    console.log("✅ Deleted blank 'Sheet1' from Master Report")
  }

  // ── 9. Rename Master Report spreadsheet ──────────────────────────────────
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: MASTER,
    requestBody: { requests: [{ updateSpreadsheetProperties: {
      properties: { title: "thrml — Master Report" },
      fields: "title"
    }}]}
  })
  console.log("✅ Renamed spreadsheet to 'thrml — Master Report'")

  console.log(`\n📊 Master Report: https://docs.google.com/spreadsheets/d/${MASTER}`)
  console.log(`📊 Finance Tracker: https://docs.google.com/spreadsheets/d/${FINANCE}`)

  // Summary of final tab state
  const finalMaster  = await sheets.spreadsheets.get({ spreadsheetId: MASTER })
  const finalFinance = await sheets.spreadsheets.get({ spreadsheetId: FINANCE })
  console.log("\nMASTER REPORT final tabs:")
  finalMaster.data.sheets?.forEach(s => console.log(`  ✓ ${s.properties.title}`))
  console.log("\nFINANCE TRACKER final tabs:")
  finalFinance.data.sheets?.forEach(s => console.log(`  ✓ ${s.properties.title}`))
}

async function applyMasterFormatting(tabMap) {
  const C = {
    dark:      { red:0.102, green:0.078, blue:0.063 },
    white:     { red:1, green:1, blue:1 },
    navy:      { red:0.078, green:0.114, blue:0.188 },
    navyMid:   { red:0.149, green:0.220, blue:0.337 },
    navyLight: { red:0.220, green:0.302, blue:0.427 },
    purple:    { red:0.94,  green:0.92,  blue:0.99  },
    amber:     { red:1.0,   green:0.94,  blue:0.8   },
    tgtTint:   { red:0.85,  green:0.80,  blue:0.99  },
    totalBg:   { red:0.063, green:0.063, blue:0.063 },
    rowA:      { red:0.961, green:0.965, blue:0.976 },
    green:     { red:0.85,  green:0.92,  blue:0.83  },
  }

  const cell = (sid,r1,r2,c1,c2,fmt) => ({ repeatCell:{
    range:{sheetId:sid,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2},
    cell:{userEnteredFormat:fmt}, fields:Object.keys(fmt).map(k=>`userEnteredFormat(${k})`).join(",")
  }})
  const cw = (sid,s,e,px) => ({updateDimensionProperties:{range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e},properties:{pixelSize:px},fields:"pixelSize"}})
  const frz = (sid,rows,cols=0) => ({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:rows,frozenColumnCount:cols}},fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount"}})

  // ── Platform Data ─────────────────────────────────────────────────────────
  const pdSid = tabMap["Platform Data"]
  if (pdSid) {
    const pdReqs = [
      frz(pdSid,1,0),
      cell(pdSid,0,1,0,36,{backgroundColor:C.dark,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
      cell(pdSid,1,500,2,5,{backgroundColor:C.purple,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}),
      cell(pdSid,0,1,12,13,{backgroundColor:C.tgtTint,textFormat:{bold:true,fontSize:10}}),
      cell(pdSid,0,1,18,21,{backgroundColor:C.amber,textFormat:{foregroundColor:C.dark,bold:true,fontSize:10}}),
      cw(pdSid,0,1,90),cw(pdSid,1,2,55),cw(pdSid,2,3,50),cw(pdSid,3,4,175),
      cw(pdSid,4,5,70),cw(pdSid,5,6,75),cw(pdSid,6,7,75),cw(pdSid,7,8,65),
      cw(pdSid,8,9,230),cw(pdSid,9,10,250),cw(pdSid,10,11,155),
      cw(pdSid,11,12,50),cw(pdSid,12,13,115),cw(pdSid,13,14,115),
      cw(pdSid,14,15,95),cw(pdSid,15,16,175),cw(pdSid,16,17,75),
      cw(pdSid,17,18,90),cw(pdSid,18,19,160),cw(pdSid,19,20,130),
      cw(pdSid,20,21,115),cw(pdSid,21,22,80),cw(pdSid,22,23,65),cw(pdSid,23,24,85),cw(pdSid,24,25,90),
      cw(pdSid,25,26,195),cw(pdSid,26,27,175),
      cw(pdSid,27,36,80),
    ]
    await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{requests:pdReqs} })
  }

  // ── Targeting Lookup ──────────────────────────────────────────────────────
  const tlSid = tabMap["Targeting Lookup"]
  if (tlSid) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{requests:[
      frz(tlSid,1),
      cell(tlSid,0,1,0,3,{backgroundColor:C.dark,textFormat:{foregroundColor:C.white,bold:true},padding:{top:5,bottom:5}}),
      cw(tlSid,0,1,130),cw(tlSid,1,2,200),cw(tlSid,2,3,300),
    ]}})
  }

  // ── Performance Report ────────────────────────────────────────────────────
  const prSid = tabMap["Performance Report"]
  if (prSid) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{requests:[
      frz(prSid,3,1),
      cell(prSid,0,1,0,9,{backgroundColor:{red:0.078,green:0.114,blue:0.169},textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:14,bottom:14}}),
      cell(prSid,1,2,0,9,{backgroundColor:{red:0.078,green:0.114,blue:0.169},textFormat:{foregroundColor:{red:0.65,green:0.75,blue:0.88},italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      cell(prSid,2,3,0,9,{backgroundColor:C.dark}),
      cw(prSid,0,1,280),cw(prSid,1,2,100),cw(prSid,2,3,110),cw(prSid,3,4,100),
      cw(prSid,4,5,130),cw(prSid,5,6,155),cw(prSid,6,7,120),cw(prSid,7,8,90),cw(prSid,8,9,120),
    ]}})
  }

  // ── Ad Performance ────────────────────────────────────────────────────────
  const apSid = tabMap["Ad Performance"]
  if (apSid) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{requests:[
      frz(apSid,1,1),
      cell(apSid,0,1,0,18,{backgroundColor:C.dark,textFormat:{foregroundColor:C.white,bold:true,fontSize:10},verticalAlignment:"MIDDLE",padding:{top:6,bottom:6}}),
      cell(apSid,1,500,0,3,{backgroundColor:C.purple,textFormat:{fontFamily:"Courier New",fontSize:9,bold:true}}),
      cw(apSid,0,1,65),cw(apSid,1,2,75),cw(apSid,2,3,75),cw(apSid,3,4,175),
      cw(apSid,4,5,50),cw(apSid,5,6,80),cw(apSid,6,7,170),cw(apSid,7,8,80),
      cw(apSid,8,9,110),cw(apSid,9,10,90),cw(apSid,10,18,85),
    ]}})
  }

  // ── Spend Breakdown + Creative Performance ────────────────────────────────
  for (const [tabTitle, numCols] of [["Spend Breakdown",3],["Creative Performance",9]]) {
    const sid = tabMap[tabTitle]
    if (!sid) continue
    await sheets.spreadsheets.batchUpdate({ spreadsheetId:MASTER, requestBody:{requests:[
      frz(sid,3,1),
      cell(sid,0,1,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:C.white,bold:true,fontSize:16},verticalAlignment:"MIDDLE",padding:{top:12,bottom:12}}),
      cell(sid,1,2,0,numCols,{backgroundColor:C.navy,textFormat:{foregroundColor:{red:0.65,green:0.75,blue:0.88},italic:true,fontSize:10},horizontalAlignment:"RIGHT"}),
      ...(tabTitle === "Spend Breakdown" ? [cw(sid,0,1,200),cw(sid,1,2,120),cw(sid,2,3,110)] :
          [cw(sid,0,1,175),cw(sid,1,2,100),cw(sid,2,3,110),cw(sid,3,4,130),cw(sid,4,5,155),cw(sid,5,6,120),cw(sid,6,7,90),cw(sid,7,8,110),cw(sid,8,9,120)]),
    ]}})
  }
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
