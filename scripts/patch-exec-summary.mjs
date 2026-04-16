import { google } from "googleapis"
import { readFileSync } from "fs"
const creds = JSON.parse(readFileSync("/tmp/gcp_creds.json", "utf8"))
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
const sheets = google.sheets({ version: "v4", auth })
const ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

const SP  = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AB2:AB10000)*('Platform Data'!AB2:AB10000))`
const BHC = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AF2:AF10000)*('Platform Data'!AF2:AF10000))`
const HOS = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AG2:AG10000)*('Platform Data'!AG2:AG10000))`
const LC  = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AH2:AH10000)*('Platform Data'!AH2:AH10000))`
const PUR = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AI2:AI10000)*('Platform Data'!AI2:AI10000))`
const IMP = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AC2:AC10000)*('Platform Data'!AC2:AC10000))`
const CLK = `SUMPRODUCT(('Platform Data'!A2:A10000<>"")*ISNUMBER('Platform Data'!AE2:AE10000)*('Platform Data'!AE2:AE10000))`
const FX  = `IFERROR(SUMPRODUCT('Fixed Costs'!C2:C20),142.67)`
const AH  = `IFERROR(SUMIF('Ad Hoc Costs'!F:F,CONCATENATE(TEXT(TODAY(),"Mmm")," ",YEAR(TODAY())),'Ad Hoc Costs'!D:D),22.07)`
const D=15, M=30, T=0.0478, G=35

const patches = [
  { range:"'Executive Summary'!A2:E2",
    values:[[`=CONCATENATE("April 2026  |  MTD as of Day ${D}/${M}  |  Take Rate: ${(T*100).toFixed(2)}%")`,"","","",""]] },
  { range:"'Executive Summary'!A7:E7",
    values:[[`=IFERROR(${SP},0)`,`=IFERROR(${BHC},0)`,`=IFERROR(${HOS},0)`,`=IFERROR(${LC},0)`,`=IFERROR(${PUR},0)`]] },
  { range:"'Executive Summary'!A12:E14", values:[
    [`  Gross Booking Value`,`${G}`,`=IFERROR(B12/${D}*${M},0)`,`=IFERROR(B12/${D}*365,0)`,"Bookings (est.) — update when Supabase live"],
    [`  Platform Revenue (Net)`,`=IFERROR(B12*${T},0)`,`=IFERROR(B12/${D}*${M}*${T},0)`,`=IFERROR(B12/${D}*365*${T},0)`,`Take rate ${(T*100).toFixed(2)}%`],
    [`  Host Payouts`,`=IFERROR(-B12*(1-${T}),0)`,`=IFERROR(-B12/${D}*${M}*(1-${T}),0)`,`=IFERROR(-B12/${D}*365*(1-${T}),0)`,`${((1-T)*100).toFixed(2)}% to hosts`],
  ]},
  { range:"'Executive Summary'!A17:E20", values:[
    [`  Fixed OpEx`,`=IFERROR(-(${FX})*${D}/${M},0)`,`=IFERROR(-(${FX}),0)`,`=IFERROR(-(${FX})*12,0)`,"See Fixed Costs tab"],
    [`  Variable / Ad Hoc`,`=IFERROR(-(${AH}),0)`,`=IFERROR(-(${AH})/${D}*${M},0)`,`=IFERROR(-(${AH})/${D}*365,0)`,"See Ad Hoc Costs tab"],
    [`  Total Ad Spend`,`=IFERROR(-(${SP}),0)`,`=IFERROR(-(${SP})/${D}*${M},0)`,`=IFERROR(-(${SP})/${D}*365,0)`,"Platform Data tab"],
    [`  Total Expenses`,`=B17+B18+B19`,`=C17+C18+C19`,`=D17+D18+D19`,""],
  ]},
  { range:"'Executive Summary'!A22:E24", values:[
    [`NET PROFIT`,`=IFERROR(B13+B20,0)`,`=IFERROR(C13+C20,0)`,`=IFERROR(D13+D20,0)`,""],
    [`Profit Margin`,`=IFERROR(B22/ABS(B13),0)`,`=IFERROR(C22/ABS(C13),0)`,`=IFERROR(D22/ABS(D13),0)`,"% of net revenue"],
    [`Cash Burn Rate (Daily)`,`=IFERROR(ABS(B20)/${D},0)`,"","","Avg daily burn MTD"],
  ]},
  { range:"'Executive Summary'!A28:E34", values:[
    [`  GBV per Booking`,`=IFERROR(B12/${PUR},0)`,"$35.00",`=IFERROR(IF(B28>=35,"✅ On Target","⚠️ Below"),"—")`,"Avg value per booking"],
    [`  # Bookings (MTD)`,`=IFERROR(${PUR},0)`,"5",`=IFERROR(IF(B29>=5,"✅ On Target","⚠️ Below"),"—")`,"Completed purchases"],
    [`  ROAS`,`=IFERROR(B13/ABS(B19),0)`,"1.5×",`=IFERROR(IF(B30>=1.5,"✅ On Target","⚠️ Below"),"—")`,"Net rev ÷ ad spend"],
    [`  CAC — Become Host`,`=IFERROR(ABS(B19)/(${BHC}),0)`,"$12.00",`=IFERROR(IF(B31<=12,"✅ On Target","⚠️ Above"),"—")`,"Ad spend ÷ BHC"],
    [`  CAC — Host Onboarding`,`=IFERROR(ABS(B19)/(${HOS}),0)`,"$30.00",`=IFERROR(IF(B32<=30,"✅ On Target","⚠️ Above"),"—")`,"Ad spend ÷ HO"],
    [`  CAC — Listing Created`,`=IFERROR(ABS(B19)/(${LC}),0)`,"$60.00",`=IFERROR(IF(B33<=60,"✅ On Target","⚠️ Above"),"—")`,"Ad spend ÷ LC"],
    [`  CPB (Cost Per Booking)`,`=IFERROR(ABS(B19)/(${PUR}),0)`,"$80.00",`=IFERROR(IF(B34<=80,"✅ On Target","⚠️ Above"),"—")`,"Ad spend ÷ purchases"],
  ]},
  { range:"'Executive Summary'!A51:E56", values:[
    [`  Impressions`,`=IFERROR(${IMP},0)`,"—","—",""],
    [`  Link Clicks`,`=IFERROR(${CLK},0)`,`=IFERROR((${CLK})/(${IMP}),0)`,`=IFERROR(ABS(B19)/(${CLK}),0)`,"CTR"],
    [`  Become Host Click (P1)`,`=IFERROR(${BHC},0)`,`=IFERROR((${BHC})/(${CLK}),0)`,`=IFERROR(ABS(B19)/(${BHC}),0)`,"P1 event"],
    [`  Host Onboarding (P2)`,`=IFERROR(${HOS},0)`,`=IFERROR((${HOS})/(${BHC}),0)`,`=IFERROR(ABS(B19)/(${HOS}),0)`,"P2 event"],
    [`  Listing Created (P3)`,`=IFERROR(${LC},0)`,`=IFERROR((${LC})/(${HOS}),0)`,`=IFERROR(ABS(B19)/(${LC}),0)`,"P3 event"],
    [`  Purchase (Guest)`,`=IFERROR(${PUR},0)`,`=IFERROR((${PUR})/(${IMP}),0)`,`=IFERROR(ABS(B19)/(${PUR}),0)`,"Guest conversion"],
  ]},
  { range:"'Executive Summary'!A60:E64", values:[
    [`  Infrastructure`,`=IFERROR(SUMIF('Fixed Costs'!B:B,"Infrastructure",'Fixed Costs'!C:C),0)`,`=IFERROR(B60*12,0)`,"",""],
    [`  Operations`,`=IFERROR(SUMIF('Fixed Costs'!B:B,"Operations",'Fixed Costs'!C:C),0)`,`=IFERROR(B61*12,0)`,"",""],
    [`  Creative`,`=IFERROR(SUMIF('Fixed Costs'!B:B,"Creative",'Fixed Costs'!C:C),0)`,`=IFERROR(B62*12,0)`,"",""],
    [`  Development`,`=IFERROR(SUMIF('Fixed Costs'!B:B,"Development",'Fixed Costs'!C:C),0)`,`=IFERROR(B63*12,0)`,"",""],
    [`  TOTAL FIXED`,`=IFERROR(${FX},0)`,`=IFERROR((${FX})*12,0)`,"",""],
  ]},
  // Fix Spend Breakdown % to reference total cell
  { range:"'Spend Breakdown'!C6:C7", values:[[`=IFERROR(B6/B8,0)`],[`=IFERROR(B7/B8,0)`]] },
]

for (const p of patches) {
  await sheets.spreadsheets.values.update({ spreadsheetId:ID, range:p.range,
    valueInputOption:"USER_ENTERED", requestBody:{values:p.values} })
}
console.log("✅ All patches applied")

// Verify
const check = await sheets.spreadsheets.values.get({ spreadsheetId:ID, range:"'Executive Summary'!A7:E34" })
check.data.values?.forEach((r,i) => { if(r.some(c=>c)) console.log(`R${i+7}: ${r.map(v=>String(v).slice(0,22)).join(" | ")}`) })
