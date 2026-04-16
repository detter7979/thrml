/**
 * Finance Tracker — Full Rebuild
 * 1. Delete Overview tab
 * 2. Add Spend Breakdown tab
 * 3. Add Creative Performance tab
 * 4. Rebuild Executive Summary (finance-first)
 */
import { google } from "googleapis"
import { readFileSync } from "fs"

const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })

const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// Known sheet IDs
const GID = {
  execSummary:   312245908,
  fixedCosts:    86681408,
  platformData:  1465143381,
  adHocCosts:    744118912,
  overview:      1631973416,
  targetingLookup: 1898468295,
  performanceReport: 217007986,
  adPerformance: 300721441,
}

// ── Platform Data column letters ──────────────────────────────────────────
// A=Date B=Year C=Month D=Week E=Platform F=CampID G=AsID H=AdID
// I=CampName J=AsName K=AdName L=Phase M=CampObj N=FunnelStage
// O=AudGroup P=TgtName Q=Geo R=SpaceType S=TgtTactic T=Placement
// U=Angle V=FmtType W=Length X=Ratio Y=CTA Z=Hook AA=OptEvent
// AB=Spend AC=Imps AD=Reach AE=Clicks AF=BHC AG=HOS AH=LC AI=Pur AJ=VV100

// ── Colour palette ────────────────────────────────────────────────────────
const C = {
  ink:      { red:0.063, green:0.047, blue:0.039 },  // near-black, warmer than pure
  white:    { red:1,     green:1,     blue:1     },
  navy:     { red:0.078, green:0.114, blue:0.188 },  // deep navy title
  navyMid:  { red:0.149, green:0.220, blue:0.337 },  // section header
  navyLight:{ red:0.220, green:0.302, blue:0.427 },  // col header
  rowA:     { red:0.961, green:0.965, blue:0.976 },  // alternate row
  rowB:     { red:1,     green:1,     blue:1     },
  green:    { red:0.133, green:0.545, blue:0.133 },  // positive metric
  red:      { red:0.820, green:0.098, blue:0.118 },  // negative metric
  amber:    { red:0.941, green:0.596, blue:0.000 },  // warning
  teal:     { red:0.000, green:0.506, blue:0.478 },  // KPI accent
  kpiBg:    { red:0.953, green:0.976, blue:0.973 },  // KPI card bg
  totalBg:  { red:0.063, green:0.063, blue:0.063 },  // totals row
  subHdrBg: { red:0.247, green:0.247, blue:0.247 },  // subsection
  divider:  { red:0.851, green:0.851, blue:0.851 },  // divider line colour
}

// ── Helpers ───────────────────────────────────────────────────────────────
const rng  = (sid,r1,r2,c1,c2) => ({ sheetId:sid, startRowIndex:r1, endRowIndex:r2, startColumnIndex:c1, endColumnIndex:c2 })
const cell = (sid,r1,r2,c1,c2,fmt) => ({ repeatCell:{ range:rng(sid,r1,r2,c1,c2), cell:{userEnteredFormat:fmt}, fields:Object.keys(fmt).map(k=>`userEnteredFormat(${k})`).join(",") }})
const cw   = (sid,s,e,px) => ({ updateDimensionProperties:{ range:{sheetId:sid,dimension:"COLUMNS",startIndex:s,endIndex:e}, properties:{pixelSize:px}, fields:"pixelSize" }})
const rh   = (sid,s,e,px) => ({ updateDimensionProperties:{ range:{sheetId:sid,dimension:"ROWS",startIndex:s,endIndex:e}, properties:{pixelSize:px}, fields:"pixelSize" }})
const frz  = (sid,rows,cols=0) => ({ updateSheetProperties:{ properties:{sheetId:sid,gridProperties:{frozenRowCount:rows,frozenColumnCount:cols}}, fields:"gridProperties.frozenRowCount,gridProperties.frozenColumnCount" }})
const border = (sid,r1,r2,c1,c2,style="SOLID",color=C.divider) => ({ updateBorders:{ range:rng(sid,r1,r2,c1,c2), top:{style,color}, bottom:{style,color}, left:{style,color}, right:{style,color} }})
const merge  = (sid,r1,r2,c1,c2) => ({ mergeCells:{ range:rng(sid,r1,r2,c1,c2), mergeType:"MERGE_ALL" }})

// SUMIF against Platform Data
const S  = (dimCol,val,metCol) => `=IFERROR(SUMIF('Platform Data'!${dimCol}:${dimCol},"${val}",'Platform Data'!${metCol}:${metCol}),0)`
const ST = (metCol)            => `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!${metCol}2:${metCol}10000)*('Platform Data'!${metCol}2:${metCol}10000)),0)`

// ── SPEND BREAKDOWN tab ───────────────────────────────────────────────────
function buildSpendBreakdown(sid) {
  const NUM_COLS = 3  // Dimension | Spend ($) | % of Total

  // Data rows per section
  const sections = [
    { label:"BY PLATFORM", col:"E", vals:["Meta","Google"] },
    { label:"BY PHASE",    col:"L", vals:["P1","P2","P3"] },
    { label:"BY MONTH",    col:"C", vals:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] },
    { label:"BY GEO",      col:"Q", vals:["Seattle","All","US"] },
    { label:"BY FUNNEL STAGE", col:"N", vals:["Prospecting","Lookalike","Retargeting"] },
  ]

  const rows = []
  rows.push(["thrml — Spend Breakdown","",""])
  rows.push([`=CONCATENATE("As of ",TEXT(TODAY(),"Mmmm D, YYYY"))` ,"",""])
  rows.push(["","",""])  // spacer

  const sectionMeta = []
  let currentRow = 4  // 1-based

  for (const sec of sections) {
    rows.push([`◆  ${sec.label}`, "", ""])
    rows.push(["Dimension", "Spend ($)", "% of Total"])

    const totalFormulaRow = currentRow + 1 + sec.vals.length + 2  // will be total row
    for (const val of sec.vals) {
      const totalRefFormula = `=IFERROR(${S(sec.col,val,"AB")}/SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AB2:AB10000)*('Platform Data'!AB2:AB10000)),0)`
      rows.push([val, S(sec.col, val, "AB"), totalRefFormula])
    }
    rows.push(["TOTAL", ST("AB"), `=IFERROR(B${currentRow + sec.vals.length + 2}/B${currentRow + sec.vals.length + 2},1)`])
    rows.push(["","",""])  // spacer

    sectionMeta.push({
      titleRow: currentRow - 1,
      hdrRow:   currentRow,
      dataStart: currentRow + 1,
      dataEnd:   currentRow + sec.vals.length,
      totalRow:  currentRow + sec.vals.length + 1,
    })
    currentRow += sec.vals.length + 4
  }

  // Add DATE breakdown at bottom — top 14 most recent dates via UNIQUE not available, use known dates
  rows.push(["◆  BY DATE (rolling 14 days)", "", ""])
  rows.push(["Date", "Spend ($)", "% of Total"])
  rows.push([`=IFERROR(TEXT(TODAY()-13,"YYYY-MM-DD"),"")`, `=IFERROR(SUMIF('Platform Data'!A:A,A${currentRow+1},'Platform Data'!AB:AB),0)`, `=IFERROR(B${currentRow+1}/${ST("AB")},0)`])
  for (let d = 12; d >= 0; d--) {
    const r = rows.length + 1
    rows.push([`=IFERROR(TEXT(TODAY()-${d},"YYYY-MM-DD"),"")`, `=IFERROR(SUMIF('Platform Data'!A:A,A${r},'Platform Data'!AB:AB),0)`, `=IFERROR(B${r}/${ST("AB")},0)`])
  }
  rows.push(["TOTAL", ST("AB"), "100%"])

  return { rows, sectionMeta, sid, NUM_COLS }
}

// ── CREATIVE PERFORMANCE tab ───────────────────────────────────────────────
function buildCreativePerformance(sid) {
  const METRIC_HDRS = ["Spend ($)","Impressions","Link Clicks","become_host_click","host_onboarding_started","listing_created","Purchase","Video Views 100%"]
  const MC = ["AB","AC","AE","AF","AG","AH","AI","AJ"]
  const NUM_COLS = 1 + METRIC_HDRS.length

  const sections = [
    { label:"BY ANGLE",       col:"U", vals:["Income","Community","Idle Space","Social Proof","Urgency","Fomo","Sensory","Thermal","Ease","Educational"] },
    { label:"BY FORMAT TYPE", col:"V", vals:["Static","Video","Carousel","UGC","RSA"] },
    { label:"BY LENGTH",      col:"W", vals:["NA","6s","15s","30s","60s"] },
    { label:"BY ASPECT RATIO",col:"X", vals:["9x16","1x1","4x5","16x9","NA"] },
    { label:"BY CTA",         col:"Y", vals:["List Now","Get Started","See How","Learn More","Book Now","Explore","Sign Up"] },
    { label:"BY AUDIENCE GROUP",col:"O",vals:["Host","Guest"] },
  ]

  const rows = []
  rows.push(["thrml — Creative Performance", ...Array(METRIC_HDRS.length).fill("")])
  rows.push([`=CONCATENATE("As of ",TEXT(TODAY(),"Mmmm D, YYYY"))`, ...Array(METRIC_HDRS.length).fill("")])
  rows.push(Array(NUM_COLS).fill(""))

  const sectionMeta = []
  let currentRow = 4

  for (const sec of sections) {
    rows.push([`◆  ${sec.label}`, ...Array(METRIC_HDRS.length).fill("")])
    rows.push(["Dimension", ...METRIC_HDRS])
    for (const val of sec.vals) {
      rows.push([val, ...MC.map(mc => S(sec.col, val, mc))])
    }
    rows.push(["TOTAL", ...MC.map(mc => ST(mc))])
    rows.push(Array(NUM_COLS).fill(""))

    sectionMeta.push({
      titleRow: currentRow - 1, hdrRow: currentRow,
      dataStart: currentRow + 1, dataEnd: currentRow + sec.vals.length,
      totalRow: currentRow + sec.vals.length + 1,
    })
    currentRow += sec.vals.length + 4
  }

  return { rows, sectionMeta, sid, NUM_COLS }
}

// ── EXECUTIVE SUMMARY (finance-first rebuild) ─────────────────────────────
function buildExecSummary(sid) {
  // All values pull from Fixed Costs tab, Ad Hoc Costs, and Platform Data
  // Hard-coded take rate and booking data — update once real Supabase data flows in
  const TAKE  = 0.0478   // 4.78% take rate
  const DAYS  = 15       // MTD days (updates manually or via agent)
  const MONTH = 30

  // Fixed costs from Fixed Costs tab — sum col C
  const fixedMTD    = `=IFERROR(SUMPRODUCT('Fixed Costs'!C2:C20)*${DAYS}/${MONTH},0)`
  const fixedMonthly= `=IFERROR(SUMPRODUCT('Fixed Costs'!C2:C20),0)`

  // Ad hoc from Ad Hoc Costs tab — sum col D
  const adHocMTD    = `=IFERROR(SUMIF('Ad Hoc Costs'!F:F,CONCATENATE(TEXT(TODAY(),"Mmm")," ",YEAR(TODAY())),'Ad Hoc Costs'!D:D),0)`

  // Total ad spend from Platform Data
  const totalSpend  = `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AB2:AB10000)*('Platform Data'!AB2:AB10000)),0)`
  const metaSpend   = `=IFERROR(SUMIF('Platform Data'!E:E,"Meta",'Platform Data'!AB:AB),0)`
  const googSpend   = `=IFERROR(SUMIF('Platform Data'!E:E,"Google",'Platform Data'!AB:AB),0)`

  // Conversion events
  const totalBHC = `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AF2:AF10000)*('Platform Data'!AF2:AF10000)),0)`
  const totalHOS = `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AG2:AG10000)*('Platform Data'!AG2:AG10000)),0)`
  const totalLC  = `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AH2:AH10000)*('Platform Data'!AH2:AH10000)),0)`
  const totalPur = `=IFERROR(SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AI2:AI10000)*('Platform Data'!AI2:AI10000)),0)`

  const rows = []
  // ── TITLE BLOCK ─────────────────────────────────────────────────────────
  rows.push(["thrml — Executive Summary","","","",""])         // R1
  rows.push([`=CONCATENATE("April 2026  |  MTD as of Day ",${DAYS},"/30  |  Take Rate: ${(TAKE*100).toFixed(2)}%")`, "","","",""]) // R2
  rows.push(["","","","",""])                                  // R3 spacer

  // ── KPI CARDS ────────────────────────────────────────────────────────────
  rows.push(["▌ KEY METRICS AT A GLANCE","","","",""])         // R4
  rows.push(["","","","",""])                                  // R5 spacer
  rows.push(["Total Ad Spend","Host Clicks (P1)","Host Onboarding (P2)","Listings Created (P3)","Purchases (Guest)"]) // R6 labels
  rows.push([totalSpend, totalBHC, totalHOS, totalLC, totalPur])                                                       // R7 values
  rows.push(["","","","",""])                                  // R8 spacer

  // ── P&L ─────────────────────────────────────────────────────────────────
  rows.push(["▌ PROFIT & LOSS", "MTD Actual", "Month Run-Rate", "Annual Run-Rate", "Notes"])  // R9
  rows.push(["","","","",""])  // R10 spacer
  rows.push(["REVENUE","","","",""])                           // R11
  rows.push(["  Gross Booking Value",      `=IFERROR(C28,0)`, `=IFERROR(C28/${DAYS}*${MONTH},0)`, `=IFERROR(C28/${DAYS}*365,0)`, "From marketplace bookings"])
  rows.push(["  Platform Revenue (Net)",  `=IFERROR(C12*${TAKE},0)`, `=IFERROR(C13*${TAKE},0)`, `=IFERROR(C14*${TAKE},0)`, `Take rate: ${(TAKE*100).toFixed(2)}%`])
  rows.push(["  Host Payouts",            `=IFERROR(-(C12*(1-${TAKE})),0)`, `=IFERROR(-(C13*(1-${TAKE})),0)`, `=IFERROR(-(C14*(1-${TAKE})),0)`, `${((1-TAKE)*100).toFixed(2)}% to hosts`])
  rows.push(["","","","",""])                                  // R15
  rows.push(["EXPENSES","","","",""])                          // R16
  rows.push(["  Fixed OpEx",             `=${fixedMTD}*-1`, `=${fixedMonthly}*-1`, `=IFERROR(C17*-12,0)`, "See Fixed Costs tab"])
  rows.push(["  Variable / Ad Hoc",      `=${adHocMTD}*-1`, `=IFERROR(C18/${DAYS}*${MONTH}*-1,0)`, `=IFERROR(C18/${DAYS}*365*-1,0)`, "See Ad Hoc Costs tab"])
  rows.push(["  Total Ad Spend",         `=${totalSpend}*-1`, `=IFERROR(C19/${DAYS}*${MONTH},0)`, `=IFERROR(C19/${DAYS}*365,0)`, "Platform Data tab"])
  rows.push(["  Total Expenses",         `=IFERROR(C17+C18+C19,0)`, `=IFERROR(D17+D18+D19,0)`, `=IFERROR(E17+E18+E19,0)`, ""])
  rows.push(["","","","",""])                                  // R21
  rows.push(["NET PROFIT",               `=IFERROR(C13+C20,0)`, `=IFERROR(D13+D20,0)`, `=IFERROR(E13+E20,0)`, ""])
  rows.push(["Profit Margin",            `=IFERROR(C22/C13,0)`, `=IFERROR(D22/D13,0)`, `=IFERROR(E22/E13,0)`, "% of net revenue"])
  rows.push(["Cash Burn Rate (Daily)",   `=IFERROR(ABS(C20)/${DAYS},0)`, "","", "MTD avg daily burn"])
  rows.push(["","","","",""])                                  // R25

  // ── UNIT ECONOMICS ───────────────────────────────────────────────────────
  rows.push(["▌ UNIT ECONOMICS", "Value", "Target", "Status", "Notes"])  // R26
  rows.push(["","","","",""])  // R27 spacer
  rows.push(["  GBV per Booking",         `=IFERROR(C12/C29,0)`, "$35.00", `=IFERROR(IF(C28>=D28,"✅","⚠️"),"—")`, "Avg $ value per booking"])
  rows.push(["  # Bookings (MTD)",        `=${totalPur}`, "5", `=IFERROR(IF(C29>=D29,"✅","⚠️"),"—")`, "Total completed bookings"])
  rows.push(["  ROAS (Return on Ad Spend)",`=IFERROR(C13/ABS(C19),0)`, "1.5×", `=IFERROR(IF(C30>=1.5,"✅","⚠️"),"—")`, "Net rev ÷ ad spend"])
  rows.push(["  CAC — Become Host Click",  `=IFERROR(ABS(C19)/${totalBHC},0)`, "$12.00", `=IFERROR(IF(C31<=12,"✅","⚠️"),"—")`, "Ad spend ÷ BHC events"])
  rows.push(["  CAC — Host Onboarding",    `=IFERROR(ABS(C19)/${totalHOS},0)`, "$30.00", `=IFERROR(IF(C32<=30,"✅","⚠️"),"—")`, "Ad spend ÷ HO events"])
  rows.push(["  CAC — Listing Created",    `=IFERROR(ABS(C19)/${totalLC},0)`, "$60.00", `=IFERROR(IF(C33<=60,"✅","⚠️"),"—")`, "Ad spend ÷ listing events"])
  rows.push(["  CPB (Cost Per Booking)",   `=IFERROR(ABS(C19)/${totalPur},0)`, "$80.00", `=IFERROR(IF(C34<=80,"✅","⚠️"),"—")`, "Ad spend ÷ purchases"])
  rows.push(["","","","",""])  // R35

  // ── AD SPEND BREAKDOWN ───────────────────────────────────────────────────
  rows.push(["▌ AD SPEND BREAKDOWN", "Spend ($)", "% of Total", "", ""])  // R36
  rows.push(["","","","",""])  // R37
  rows.push(["By Platform","","","",""])  // R38
  rows.push(["  Meta",    metaSpend, `=IFERROR(B39/${totalSpend},0)`, "", ""])
  rows.push(["  Google",  googSpend, `=IFERROR(B40/${totalSpend},0)`, "", ""])
  rows.push(["  TOTAL",   totalSpend, "100%", "", ""])
  rows.push(["","","","",""])  // R42
  rows.push(["By Phase","","","",""])  // R43
  rows.push(["  P1 — Awareness / Reach",   S("L","P1","AB"), `=IFERROR(B44/${totalSpend},0)`, "", "become_host_click"])
  rows.push(["  P2 — Lead / Onboarding",   S("L","P2","AB"), `=IFERROR(B45/${totalSpend},0)`, "", "host_onboarding_started"])
  rows.push(["  P3 — Conversion",          S("L","P3","AB"), `=IFERROR(B46/${totalSpend},0)`, "", "listing_created / purchase"])
  rows.push(["  TOTAL",                    totalSpend, "100%", "", ""])
  rows.push(["","","","",""])  // R48

  // ── CONVERSION FUNNEL ────────────────────────────────────────────────────
  rows.push(["▌ CONVERSION FUNNEL", "Events", "Conv. Rate", "CPE ($)", ""])  // R49
  rows.push(["","","","",""])  // R50
  rows.push(["  Impressions",           `${ST("AC")}`, "—", "—", ""])
  rows.push(["  Link Clicks",           `${ST("AE")}`, `=IFERROR(B52/B51,0)`, `=IFERROR(ABS(C19)/B52,0)`, "CTR"])
  rows.push(["  Become Host Click (P1)",`${totalBHC}`, `=IFERROR(B53/B52,0)`, `=IFERROR(ABS(C19)/B53,0)`, "P1 event"])
  rows.push(["  Host Onboarding (P2)",  `${totalHOS}`, `=IFERROR(B54/B53,0)`, `=IFERROR(ABS(C19)/B54,0)`, "P2 event"])
  rows.push(["  Listing Created (P3)",  `${totalLC}`, `=IFERROR(B55/B54,0)`, `=IFERROR(ABS(C19)/B55,0)`, "P3 event"])
  rows.push(["  Purchase (Guest)",      `${totalPur}`, `=IFERROR(B56/B51,0)`, `=IFERROR(ABS(C19)/B56,0)`, "Guest purchase"])
  rows.push(["","","","",""])  // R57

  // ── FIXED COST SUMMARY ───────────────────────────────────────────────────
  rows.push(["▌ FIXED COSTS SUMMARY", "Monthly ($)", "Annual ($)", "", ""])  // R58
  rows.push(["","","","",""])  // R59
  rows.push(["  Infrastructure",  `=IFERROR(SUMIF('Fixed Costs'!B:B,"Infrastructure",'Fixed Costs'!C:C),0)`, `=IFERROR(B60*12,0)`, "", ""])
  rows.push(["  Operations",      `=IFERROR(SUMIF('Fixed Costs'!B:B,"Operations",'Fixed Costs'!C:C),0)`, `=IFERROR(B61*12,0)`, "", ""])
  rows.push(["  Creative",        `=IFERROR(SUMIF('Fixed Costs'!B:B,"Creative",'Fixed Costs'!C:C),0)`, `=IFERROR(B62*12,0)`, "", ""])
  rows.push(["  Development",     `=IFERROR(SUMIF('Fixed Costs'!B:B,"Development",'Fixed Costs'!C:C),0)`, `=IFERROR(B63*12,0)`, "", ""])
  rows.push(["  TOTAL FIXED",     fixedMonthly, `=IFERROR(B64*12,0)`, "", ""])

  return rows
}

// ── Format a pivot section (shared across Spend Breakdown + Creative Perf) ─
function pivotSectionRequests(sid, meta, numCols) {
  const reqs = []
  for (const sec of meta) {
    const tr = sec.titleRow - 1  // 0-based
    const hr = sec.hdrRow - 1
    const ds = sec.dataStart - 1
    const de = sec.dataEnd       // exclusive
    const tot = sec.totalRow - 1

    reqs.push(cell(sid,tr,tr+1,0,numCols,{ backgroundColor:C.navyMid, textFormat:{foregroundColor:C.white,bold:true,fontSize:11}, verticalAlignment:"MIDDLE", padding:{top:7,bottom:7} }))
    reqs.push(cell(sid,hr,hr+1,0,numCols,{ backgroundColor:C.navyLight, textFormat:{foregroundColor:C.white,bold:true,fontSize:10}, verticalAlignment:"MIDDLE", horizontalAlignment:"CENTER" }))
    reqs.push(cell(sid,hr,hr+1,0,1,{ horizontalAlignment:"LEFT" }))
    for (let r=ds; r<de; r++) {
      const bg = (r-ds)%2===0 ? C.rowA : C.rowB
      reqs.push(cell(sid,r,r+1,0,numCols,{ backgroundColor:bg, textFormat:{fontSize:10} }))
      reqs.push(cell(sid,r,r+1,1,numCols,{ horizontalAlignment:"RIGHT" }))
    }
    reqs.push(cell(sid,tot,tot+1,0,numCols,{ backgroundColor:C.totalBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:10}, horizontalAlignment:"RIGHT" }))
    reqs.push(cell(sid,tot,tot+1,0,1,{ horizontalAlignment:"LEFT" }))
    reqs.push(border(sid,tot,tot+1,0,numCols,"SOLID_MEDIUM",{red:0.4,green:0.4,blue:0.4}))
    reqs.push(rh(sid,tr,tr+1,30))
  }
  return reqs
}

// ── Format Exec Summary ────────────────────────────────────────────────────
function execSummaryFmtRequests(sid) {
  const reqs = []

  // Title block rows 0-2
  reqs.push(cell(sid,0,1,0,5,{ backgroundColor:C.navy, textFormat:{foregroundColor:C.white,bold:true,fontSize:18}, verticalAlignment:"MIDDLE", padding:{top:14,bottom:14} }))
  reqs.push(cell(sid,1,2,0,5,{ backgroundColor:C.navy, textFormat:{foregroundColor:{red:0.65,green:0.75,blue:0.88},italic:true,fontSize:10}, horizontalAlignment:"RIGHT" }))
  reqs.push(cell(sid,2,3,0,5,{ backgroundColor:{red:0.18,green:0.25,blue:0.37} }))
  reqs.push(rh(sid,0,1,52))
  reqs.push(rh(sid,1,2,24))
  reqs.push(rh(sid,2,3,6))

  // ── KPI Cards (rows 3-7) ─────────────────────────────────────────────────
  reqs.push(cell(sid,3,4,0,5,{ backgroundColor:C.navyMid, textFormat:{foregroundColor:C.white,bold:true,fontSize:11}, verticalAlignment:"MIDDLE", padding:{top:7,bottom:7} }))
  reqs.push(rh(sid,3,4,30))
  // KPI label row (R6 = index 5)
  reqs.push(cell(sid,5,6,0,5,{ backgroundColor:{red:0.22,green:0.30,blue:0.42}, textFormat:{foregroundColor:{red:0.7,green:0.8,blue:0.9},bold:true,fontSize:9}, horizontalAlignment:"CENTER", padding:{top:5,bottom:5} }))
  // KPI value row (R7 = index 6)
  reqs.push(cell(sid,6,7,0,5,{ backgroundColor:C.kpiBg, textFormat:{foregroundColor:C.teal,bold:true,fontSize:16}, horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE", padding:{top:10,bottom:10} }))
  reqs.push(rh(sid,6,7,44))
  reqs.push(border(sid,5,7,0,5,"SOLID",{red:0.2,green:0.4,blue:0.6}))

  // ── P&L section header (R9 = index 8) ────────────────────────────────────
  const pnlSections = [
    { rows:[8,9], bg:C.navyMid, text:true },       // section title
    { rows:[9,10], bg:C.navyLight, text:true },     // col header
    { rows:[10,11], bg:{red:0.20,green:0.20,blue:0.20}, text:true },  // REVENUE sub-header
    { rows:[11,14], alternating:true },             // revenue data rows
    { rows:[15,16], bg:{red:0.20,green:0.20,blue:0.20}, text:true },  // EXPENSES sub-header
    { rows:[16,20], alternating:true },             // expense data rows
    { rows:[21,22], bg:C.totalBg, text:true, bold:true },  // NET PROFIT
    { rows:[22,24], alternating:true },             // margin + burn
  ]

  // Section headers
  for (const r of [8,25,35,48,57]) {
    reqs.push(cell(sid,r,r+1,0,5,{ backgroundColor:C.navyMid, textFormat:{foregroundColor:C.white,bold:true,fontSize:11}, verticalAlignment:"MIDDLE", padding:{top:7,bottom:7} }))
    reqs.push(rh(sid,r,r+1,30))
  }
  // Column headers
  for (const r of [9,26,36,49]) {
    reqs.push(cell(sid,r,r+1,0,5,{ backgroundColor:C.navyLight, textFormat:{foregroundColor:C.white,bold:true,fontSize:10}, horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE" }))
    reqs.push(cell(sid,r,r+1,0,1,{ horizontalAlignment:"LEFT" }))
  }
  // Sub-headers (REVENUE, EXPENSES, By Platform, By Phase, etc.)
  for (const r of [10,15,37,42]) {
    reqs.push(cell(sid,r,r+1,0,5,{ backgroundColor:C.subHdrBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:10} }))
    reqs.push(rh(sid,r,r+1,24))
  }
  // Alternating data rows — P&L (rows 11-14, 16-20)
  for (const [s,e] of [[11,15],[16,21],[27,35],[39,42],[44,48],[50,57],[59,64]]) {
    for (let r=s; r<e; r++) {
      const bg = (r-s)%2===0 ? C.rowA : C.rowB
      reqs.push(cell(sid,r,r+1,0,5,{ backgroundColor:bg, textFormat:{fontSize:10} }))
      reqs.push(cell(sid,r,r+1,1,5,{ horizontalAlignment:"RIGHT" }))
    }
  }
  // NET PROFIT row (index 21)
  reqs.push(cell(sid,21,22,0,5,{ backgroundColor:C.totalBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:12}, horizontalAlignment:"RIGHT", padding:{top:8,bottom:8} }))
  reqs.push(cell(sid,21,22,0,1,{ horizontalAlignment:"LEFT" }))
  reqs.push(border(sid,21,22,0,5,"SOLID_MEDIUM",{red:0.4,green:0.4,blue:0.4}))
  reqs.push(rh(sid,21,22,34))

  // TOTAL rows in spend breakdown (index 40, 46)
  for (const r of [40,46,63]) {
    reqs.push(cell(sid,r,r+1,0,5,{ backgroundColor:C.totalBg, textFormat:{foregroundColor:C.white,bold:true,fontSize:10}, horizontalAlignment:"RIGHT" }))
    reqs.push(cell(sid,r,r+1,0,1,{ horizontalAlignment:"LEFT" }))
  }

  // Column widths
  reqs.push(cw(sid,0,1,260))  // Label
  reqs.push(cw(sid,1,2,120))  // Value/Spend
  reqs.push(cw(sid,2,3,130))  // Run-rate / %
  reqs.push(cw(sid,3,4,130))  // Annual
  reqs.push(cw(sid,4,5,210))  // Notes

  // Number formats
  // Percentage rows (23, 40, 46)
  const PCT = "0.00%"
  const DOLLAR = `"$"#,##0.00`

  reqs.push(frz(sid,3,1))

  return reqs
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🏗  Finance Tracker rebuild\n")

  // 1. Get existing tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const tabMap = Object.fromEntries(meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]))

  // 2. Delete Overview tab
  if (tabMap["Overview"] !== undefined) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: [
      { deleteSheet: { sheetId: tabMap["Overview"] } }
    ]}})
    console.log("✅ Deleted 'Overview' tab")
  }

  // 3. Add missing tabs
  const toAdd = ["Spend Breakdown","Creative Performance"].filter(t => !tabMap[t])
  if (toAdd.length) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: {
      requests: toAdd.map(title => ({ addSheet: { properties: { title } } }))
    }})
    r.data.replies.forEach(rep => {
      if (rep.addSheet) tabMap[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId
    })
    console.log("✅ Added tabs:", toAdd.join(", "))
  }

  const SB_SID  = tabMap["Spend Breakdown"]
  const CP_SID  = tabMap["Creative Performance"]
  const ES_SID  = GID.execSummary

  // 4. Spend Breakdown
  const sb = buildSpendBreakdown(SB_SID)
  await sheets.spreadsheets.values.clear({ spreadsheetId: MASTER_ID, range: "'Spend Breakdown'!A1:D500" })
  await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "'Spend Breakdown'!A1",
    valueInputOption: "USER_ENTERED", requestBody: { values: sb.rows } })
  const sbFmt = [
    frz(SB_SID,3,1),
    cell(SB_SID,0,1,0,3,{ backgroundColor:C.navy, textFormat:{foregroundColor:C.white,bold:true,fontSize:16}, verticalAlignment:"MIDDLE", padding:{top:12,bottom:12} }),
    cell(SB_SID,1,2,0,3,{ backgroundColor:C.navy, textFormat:{foregroundColor:{red:0.65,green:0.75,blue:0.88},italic:true,fontSize:10}, horizontalAlignment:"RIGHT" }),
    rh(SB_SID,0,1,44), rh(SB_SID,1,2,22),
    cw(SB_SID,0,1,200), cw(SB_SID,1,2,120), cw(SB_SID,2,3,110),
    ...pivotSectionRequests(SB_SID, sb.sectionMeta, sb.NUM_COLS),
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: sbFmt } })
  console.log(`✅ Spend Breakdown — ${sb.rows.length} rows`)

  // 5. Creative Performance
  const cp = buildCreativePerformance(CP_SID)
  await sheets.spreadsheets.values.clear({ spreadsheetId: MASTER_ID, range: "'Creative Performance'!A1:I400" })
  await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "'Creative Performance'!A1",
    valueInputOption: "USER_ENTERED", requestBody: { values: cp.rows } })
  const cpFmt = [
    frz(CP_SID,3,1),
    cell(CP_SID,0,1,0,cp.NUM_COLS,{ backgroundColor:C.navy, textFormat:{foregroundColor:C.white,bold:true,fontSize:16}, verticalAlignment:"MIDDLE", padding:{top:12,bottom:12} }),
    cell(CP_SID,1,2,0,cp.NUM_COLS,{ backgroundColor:C.navy, textFormat:{foregroundColor:{red:0.65,green:0.75,blue:0.88},italic:true,fontSize:10}, horizontalAlignment:"RIGHT" }),
    rh(CP_SID,0,1,44), rh(CP_SID,1,2,22),
    cw(CP_SID,0,1,175), cw(CP_SID,1,2,100), cw(CP_SID,2,3,110), cw(CP_SID,3,4,130), cw(CP_SID,4,5,155), cw(CP_SID,5,6,120), cw(CP_SID,6,7,90), cw(CP_SID,7,8,110), cw(CP_SID,8,9,120),
    ...pivotSectionRequests(CP_SID, cp.sectionMeta, cp.NUM_COLS),
  ]
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: cpFmt } })
  console.log(`✅ Creative Performance — ${cp.rows.length} rows`)

  // 6. Executive Summary
  const esRows = buildExecSummary(ES_SID)
  await sheets.spreadsheets.values.clear({ spreadsheetId: MASTER_ID, range: "'Executive Summary'!A1:E100" })
  await sheets.spreadsheets.values.update({ spreadsheetId: MASTER_ID, range: "'Executive Summary'!A1",
    valueInputOption: "USER_ENTERED", requestBody: { values: esRows } })
  const esFmt = execSummaryFmtRequests(ES_SID)
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: MASTER_ID, requestBody: { requests: esFmt } })
  console.log(`✅ Executive Summary — ${esRows.length} rows`)

  console.log(`\n📊 https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

main().catch(e => { console.error("❌", e.message); process.exit(1) })
