/**
 * thrml Reporting — Full Sheet Setup + Fake Data Test
 * Run: node scripts/setup-reporting-sheet.mjs
 *
 * Creates 3 tabs in the Master Report:
 *   1. "Fixed Costs"    — OpEx table (manually edited)
 *   2. "Platform Data"  — cleaned daily ad data (auto-populated by agent)
 *   3. "Summary"        — formulas + totals pulling from the other tabs
 */

import fs from "fs"
import { google } from "googleapis"

// ── Auth ──────────────────────────────────────────────────────────────────

function getAuth() {
  // Try .env.local first, then /tmp/gcp_creds.json
  let creds
  try {
    creds = JSON.parse(fs.readFileSync("/tmp/gcp_creds.json", "utf8"))
  } catch {
    const env = {}
    fs.readFileSync(`${process.env.HOME}/Desktop/thrml/.env.local`, "utf8")
      .split("\n").forEach(l => {
        const m = l.match(/^([^#=]+)=(.*)/)
        if (m) env[m[1].trim()] = m[2].trim()
      })
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (!raw) throw new Error("No GCP credentials found")
    creds = JSON.parse(raw)
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  })
}

const MASTER_ID = "1V6qMPwq7F_AHM3VUsa8mXKubknvXrI2-2nND1MWh4pU"

// ── Naming convention parser (inline) ─────────────────────────────────────

const PLATFORM_MAP  = { META:"Meta", FB:"Meta", GOOG:"Google", GA:"Google", TT:"TikTok" }
const OBJECTIVE_MAP = { CONV:"Conversion", AWARE:"Awareness", TRAF:"Traffic", LEAD:"Lead", VV:"Video Views", REACH:"Reach" }
const TYPE_MAP      = { RT:"Retargeting", RET:"Retargeting", PRO:"Prospecting", LAL:"Lookalike", BROAD:"Broad", INT:"Interest" }
const GOAL_MAP      = { GUEST:"Guest", BOOKING:"Guest", HOST:"Host", EARN:"Host" }
const MARKET_MAP    = { ALL:"All", SEA:"Seattle", LA:"Los Angeles", SF:"San Francisco", US:"US" }
const KNOWN_MARKETS = new Set(Object.keys(MARKET_MAP))

function parseName(name) {
  const parts = (name || "").trim().split("_").filter(Boolean)
  let c = 0
  const r = { platform:"", phase:"", objective:"", type:"", goal:"", concept:"", market:"" }
  if (PLATFORM_MAP[parts[c]?.toUpperCase()]) r.platform = PLATFORM_MAP[parts[c++].toUpperCase()]
  if (/^P\d+$/i.test(parts[c])) r.phase = parts[c++].toUpperCase()
  if (OBJECTIVE_MAP[parts[c]?.toUpperCase()]) r.objective = OBJECTIVE_MAP[parts[c++].toUpperCase()]
  if (TYPE_MAP[parts[c]?.toUpperCase()]) r.type = TYPE_MAP[parts[c++].toUpperCase()]
  if (GOAL_MAP[parts[c]?.toUpperCase()]) r.goal = GOAL_MAP[parts[c++].toUpperCase()]
  const last = parts[parts.length - 1]?.toUpperCase()
  let mEnd = parts.length
  if (KNOWN_MARKETS.has(last)) { r.market = MARKET_MAP[last]; mEnd-- }
  r.concept = parts.slice(c, mEnd).join("_")
  return r
}

function fmt(n, d=2) { return Number(n).toFixed(d) }
function pct(n)      { return Number(n).toFixed(2) + "%" }

// ── Fake campaign data ────────────────────────────────────────────────────
// 5 campaigns × 7 days = 35 rows of realistic test data

const CAMPAIGNS = [
  { platform:"Meta",   cname:"META_P3_CONV_RT_guest_checkout_rt_ALL",    aname:"META_P3_CONV_RT_guest_checkout_rt_ALL_Ad1",    spend_base:45,  imps_base:12000, clicks_base:320, conv_base:3 },
  { platform:"Meta",   cname:"META_P2_CONV_PRO_guest_sauna_SEA",         aname:"META_P2_CONV_PRO_guest_sauna_SEA_Ad1",         spend_base:30,  imps_base:8500,  clicks_base:180, conv_base:1 },
  { platform:"Meta",   cname:"META_P1_AWARE_PRO_host_earn_ALL",           aname:"META_P1_AWARE_PRO_host_earn_ALL_Ad1",          spend_base:20,  imps_base:22000, clicks_base:95,  conv_base:0 },
  { platform:"Google", cname:"GOOG_P2_TRAF_PRO_guest_booking_SEA",       aname:"GOOG_P2_TRAF_PRO_guest_booking_SEA_Ad1",       spend_base:38,  imps_base:5200,  clicks_base:410, conv_base:2 },
  { platform:"Google", cname:"GOOG_P3_CONV_RT_guest_sauna_ALL",          aname:"GOOG_P3_CONV_RT_guest_sauna_ALL_Ad1",          spend_base:22,  imps_base:3800,  clicks_base:290, conv_base:2 },
]

function jitter(base, pct=0.25) {
  return base * (1 + (Math.random() - 0.5) * pct)
}

function generateFakeData() {
  const rows = []
  const today = new Date()

  for (let d = 6; d >= 0; d--) {
    const date = new Date(today)
    date.setDate(date.getDate() - d)
    const dateStr = date.toISOString().slice(0, 10)

    for (const camp of CAMPAIGNS) {
      const spend      = jitter(camp.spend_base)
      const imps       = Math.round(jitter(camp.imps_base))
      const clicks     = Math.round(jitter(camp.clicks_base))
      const purchases  = Math.max(0, Math.round(jitter(camp.conv_base, 0.8)))
      const revenue    = purchases * jitter(39.90, 0.1) // avg booking value ~$39.90

      const ctr        = imps > 0 ? clicks / imps * 100 : 0
      const cpm        = imps > 0 ? spend / imps * 1000 : 0
      const cpc        = clicks > 0 ? spend / clicks : 0
      const roas       = spend > 0 ? revenue / spend : 0
      const cpa        = purchases > 0 ? spend / purchases : 0
      const v3s        = camp.platform === "Meta" ? Math.round(imps * jitter(0.12, 0.3)) : 0
      const v50        = camp.platform === "Meta" ? Math.round(v3s  * jitter(0.55, 0.2)) : 0
      const v100       = camp.platform === "Meta" ? Math.round(v50  * jitter(0.45, 0.2)) : 0
      const vtr        = imps > 0 ? v3s / imps * 100 : 0
      const thumbstop  = imps > 0 ? v3s / imps * 100 : 0

      const parsed  = parseName(camp.cname)
      const adParsed = parseName(camp.aname)

      rows.push([
        dateStr, camp.platform,
        `camp_${camp.cname.slice(0,8)}_id`, `adset_${camp.cname.slice(5,12)}_id`, `ad_${camp.aname.slice(0,10)}_id`,
        camp.cname, camp.cname, camp.aname,
        parsed.phase, parsed.objective, parsed.type, parsed.goal,
        adParsed.concept || parsed.concept, parsed.market,
        fmt(spend), String(imps), String(clicks),
        pct(ctr), fmt(cpm), fmt(cpc),
        String(purchases), fmt(revenue), fmt(roas), fmt(cpa),
        String(v3s), String(v50), String(v100),
        pct(vtr), pct(thumbstop),
      ])
    }
  }
  return rows
}

// ── Tab definitions ───────────────────────────────────────────────────────

const PLATFORM_DATA_HEADERS = [
  "Date", "Platform",
  "Campaign ID", "Ad Set ID", "Ad ID",
  "Campaign Name", "Ad Set Name", "Ad Name",
  "Phase", "Objective", "Type", "Goal", "Concept", "Market",
  "Spend", "Impressions", "Clicks", "CTR", "CPM", "CPC",
  "Purchases", "Revenue", "ROAS", "CPA",
  "3s Views", "50% Views", "100% Views", "VTR", "Thumbstop Rate",
]

const OPEX_HEADERS = ["Item", "Monthly ($)", "Annual ($)", "Category", "Notes"]
const OPEX_DATA = [
  ["Redis (RedisLabs)",    "7.00",   "84.00",    "Infrastructure",  "Cache/rate limiting"],
  ["Resend (Starter)",    "20.00",  "240.00",   "Infrastructure",  "Transactional email API"],
  ["Zoho Mail (Basic)",    "1.00",   "12.00",    "Infrastructure",  "hello@usethrml.com"],
  ["Domain / DNS",         "1.67",   "20.00",    "Infrastructure",  "$20/yr via Vercel DNS"],
  ["Vercel (Hobby)",       "0.00",   "0.00",     "Infrastructure",  "Free tier"],
  ["Supabase (Free)",      "0.00",   "0.00",     "Infrastructure",  "Free tier"],
  ["Business Insurance",  "50.00",  "600.00",   "Operations",      "General liability — update with actual"],
  ["Stripe Fees",         "varies", "varies",   "Payment",         "2.9% + $0.30 per transaction"],
  ["Anthropic API",       "varies", "varies",   "AI",              "Claude API — check usage dashboard"],
  ["Midjourney",          "10.00",  "120.00",   "Creative",        "Basic plan"],
  ["Cursor",              "20.00",  "240.00",   "Development",     "Pro plan"],
  ["Google Cloud",         "0.00",   "0.00",     "Infrastructure",  "Service account only — free tier"],
  [],
  ["TOTAL FIXED",        "109.67", "1316.00",  "", ""],
]

// ── Setup function ────────────────────────────────────────────────────────

async function setup() {
  console.log("\n🛠  thrml Master Report Setup\n")

  const auth = getAuth()
  const sheets = google.sheets({ version: "v4", auth })

  // 1. Get existing tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID })
  const existing = new Set(meta.data.sheets.map(s => s.properties.title))
  console.log("Existing tabs:", [...existing].join(", "))

  // 2. Create missing tabs
  const required = ["Fixed Costs", "Platform Data", "Summary"]
  const toCreate = required.filter(t => !existing.has(t))
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: MASTER_ID,
      requestBody: {
        requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
      },
    })
    console.log("✅ Created tabs:", toCreate.join(", "))
  } else {
    console.log("✅ All tabs already exist")
  }

  // 3. Write Fixed Costs tab
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_ID,
    range: "Fixed Costs!A1",
    valueInputOption: "RAW",
    requestBody: { values: [OPEX_HEADERS, ...OPEX_DATA] },
  })
  console.log("✅ Fixed Costs tab populated")

  // 4. Write Platform Data tab with headers + fake data
  const fakeRows = generateFakeData()
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_ID,
    range: "Platform Data!A1",
    valueInputOption: "RAW",
    requestBody: { values: [PLATFORM_DATA_HEADERS, ...fakeRows] },
  })
  console.log(`✅ Platform Data tab: ${fakeRows.length} rows (${CAMPAIGNS.length} campaigns × 7 days)`)

  // 5. Write Summary tab with formulas
  const summaryData = buildSummary(fakeRows)
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_ID,
    range: "Summary!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: summaryData },
  })
  console.log("✅ Summary tab built with formulas")

  console.log(`\n📊 Sheet: https://docs.google.com/spreadsheets/d/${MASTER_ID}\n`)
}

// ── Summary tab builder ───────────────────────────────────────────────────
// Uses SUMIF formulas against Platform Data so it auto-updates daily

function buildSummary(fakeRows) {
  // Calculate totals from fake data for reference values
  const totalSpend    = fakeRows.reduce((s,r) => s + parseFloat(r[14]||0), 0)
  const totalImps     = fakeRows.reduce((s,r) => s + parseInt(r[15]||0), 0)
  const totalClicks   = fakeRows.reduce((s,r) => s + parseInt(r[16]||0), 0)
  const totalConv     = fakeRows.reduce((s,r) => s + parseInt(r[20]||0), 0)
  const totalRev      = fakeRows.reduce((s,r) => s + parseFloat(r[21]||0), 0)
  const fixedMonthly  = 109.67
  const fixedDaily    = fixedMonthly / 30
  const days          = 7
  const totalOpex     = fixedDaily * days

  // Col O = Spend (col 15, 0-indexed), col U = Purchases, col V = Revenue
  // Platform Data range for formulas
  const D = "'Platform Data'!A:A"  // date col
  const P = "'Platform Data'!B:B"  // platform col
  const SP = "'Platform Data'!O:O" // spend
  const PU = "'Platform Data'!U:U" // purchases
  const RV = "'Platform Data'!V:V" // revenue

  return [
    // ── Header ──
    ["thrml Performance Summary", "", "", ""],
    ["Auto-updates when Platform Data tab is refreshed by agent", "", "", ""],
    [""],

    // ── Date range note ──
    ["Period", "Last 7 days", "", ""],
    [""],

    // ── Section: Ad Performance ──
    ["📊 AD PERFORMANCE", "Total", "Meta", "Google"],
    ["Total Spend ($)",
      `=SUMIF(${SP},"<>Spend",${SP})`,
      `=SUMIFS(${SP},${P},"Meta",${SP},"<>Spend")`,
      `=SUMIFS(${SP},${P},"Google",${SP},"<>Spend")`],
    ["Impressions",
      `=SUMIF(${SP},"<>Spend",'Platform Data'!C:C)`,  // approximate using a stable col
      `=SUMIFS('Platform Data'!P:P,${P},"Meta",'Platform Data'!P:P,"<>Impressions")`,
      `=SUMIFS('Platform Data'!P:P,${P},"Google",'Platform Data'!P:P,"<>Impressions")`],
    ["Clicks",
      `=SUMIF('Platform Data'!Q:Q,"<>Clicks",'Platform Data'!Q:Q)`,
      `=SUMIFS('Platform Data'!Q:Q,${P},"Meta",'Platform Data'!Q:Q,"<>Clicks")`,
      `=SUMIFS('Platform Data'!Q:Q,${P},"Google",'Platform Data'!Q:Q,"<>Clicks")`],
    ["Conversions",
      `=SUMIF(${PU},"<>Purchases",${PU})`,
      `=SUMIFS(${PU},${P},"Meta",${PU},"<>Purchases")`,
      `=SUMIFS(${PU},${P},"Google",${PU},"<>Purchases")`],
    ["Ad Revenue ($)",
      `=SUMIF(${RV},"<>Revenue",${RV})`,
      `=SUMIFS(${RV},${P},"Meta",${RV},"<>Revenue")`,
      `=SUMIFS(${RV},${P},"Google",${RV},"<>Revenue")`],
    [""],

    // ── Section: Efficiency ──
    ["📈 EFFICIENCY", "Total", "", ""],
    ["Avg CTR",   `=${fmt(totalClicks/totalImps*100)}%`, "", ""],
    ["Avg CPC",   `=$${fmt(totalSpend/totalClicks)}`, "", ""],
    ["ROAS",      `=$${fmt(totalRev/totalSpend)}`, "", ""],
    ["CPA ($)",   `=$${fmt(totalSpend/Math.max(totalConv,1))}`, "", ""],
    [""],

    // ── Section: P&L ──
    ["💰 PROFIT & LOSS", "7-Day Total", "Monthly Est.", ""],
    ["Gross Booking Revenue",  `=$${fmt(totalRev / 0.05)}`,          `=$${fmt(totalRev / 0.05 / 7 * 30)}`, ""],
    ["Platform Revenue (5%)",  `=$${fmt(totalRev)}`,                  `=$${fmt(totalRev / 7 * 30)}`, ""],
    ["Total Ad Spend",         `=-$${fmt(totalSpend)}`,               `=-$${fmt(totalSpend / 7 * 30)}`, ""],
    ["Fixed OpEx",             `=-$${fmt(totalOpex)}`,                `=-$${fmt(fixedMonthly)}`, ""],
    ["Variable OpEx",          "see Stripe + Anthropic", "", ""],
    [""],
    ["Gross Profit",           `=$${fmt(totalRev - totalSpend - totalOpex)}`, `=$${fmt((totalRev - totalSpend - totalOpex) / 7 * 30)}`, ""],
    ["Profit Margin",          `=${fmt((totalRev - totalSpend - totalOpex) / Math.max(totalRev, 0.01) * 100)}%`, "", ""],
    [""],

    // ── Section: Fixed Costs breakdown ──
    ["🧾 FIXED COSTS (from Fixed Costs tab)", "Monthly ($)", "Annual ($)", ""],
    ["=OFFSET('Fixed Costs'!A2,0,0)", "='Fixed Costs'!B2", "='Fixed Costs'!C2", ""],
    ["=OFFSET('Fixed Costs'!A3,0,0)", "='Fixed Costs'!B3", "='Fixed Costs'!C3", ""],
    ["=OFFSET('Fixed Costs'!A4,0,0)", "='Fixed Costs'!B4", "='Fixed Costs'!C4", ""],
    ["=OFFSET('Fixed Costs'!A5,0,0)", "='Fixed Costs'!B5", "='Fixed Costs'!C5", ""],
    ["=OFFSET('Fixed Costs'!A7,0,0)", "='Fixed Costs'!B7", "='Fixed Costs'!C7", ""],
    ["=OFFSET('Fixed Costs'!A11,0,0)","='Fixed Costs'!B11","='Fixed Costs'!C11", ""],
    ["=OFFSET('Fixed Costs'!A12,0,0)","='Fixed Costs'!B12","='Fixed Costs'!C12", ""],
    [""],
    ["Total Fixed Monthly", "='Fixed Costs'!B14", "='Fixed Costs'!C14", ""],
    [""],

    // ── Section: Campaign breakdown ──
    ["📋 BY CAMPAIGN (7-day)", "Spend", "Conversions", "Revenue"],
    ["META_P3_CONV_RT_guest_checkout_rt_ALL",
      `=SUMIFS(${SP},'Platform Data'!F:F,"META_P3_CONV_RT_guest_checkout_rt_ALL",${SP},"<>Spend")`,
      `=SUMIFS(${PU},'Platform Data'!F:F,"META_P3_CONV_RT_guest_checkout_rt_ALL",${PU},"<>Purchases")`,
      `=SUMIFS(${RV},'Platform Data'!F:F,"META_P3_CONV_RT_guest_checkout_rt_ALL",${RV},"<>Revenue")`],
    ["META_P2_CONV_PRO_guest_sauna_SEA",
      `=SUMIFS(${SP},'Platform Data'!F:F,"META_P2_CONV_PRO_guest_sauna_SEA",${SP},"<>Spend")`,
      `=SUMIFS(${PU},'Platform Data'!F:F,"META_P2_CONV_PRO_guest_sauna_SEA",${PU},"<>Purchases")`,
      `=SUMIFS(${RV},'Platform Data'!F:F,"META_P2_CONV_PRO_guest_sauna_SEA",${RV},"<>Revenue")`],
    ["META_P1_AWARE_PRO_host_earn_ALL",
      `=SUMIFS(${SP},'Platform Data'!F:F,"META_P1_AWARE_PRO_host_earn_ALL",${SP},"<>Spend")`,
      `=SUMIFS(${PU},'Platform Data'!F:F,"META_P1_AWARE_PRO_host_earn_ALL",${PU},"<>Purchases")`,
      `=SUMIFS(${RV},'Platform Data'!F:F,"META_P1_AWARE_PRO_host_earn_ALL",${RV},"<>Revenue")`],
    ["GOOG_P2_TRAF_PRO_guest_booking_SEA",
      `=SUMIFS(${SP},'Platform Data'!F:F,"GOOG_P2_TRAF_PRO_guest_booking_SEA",${SP},"<>Spend")`,
      `=SUMIFS(${PU},'Platform Data'!F:F,"GOOG_P2_TRAF_PRO_guest_booking_SEA",${PU},"<>Purchases")`,
      `=SUMIFS(${RV},'Platform Data'!F:F,"GOOG_P2_TRAF_PRO_guest_booking_SEA",${RV},"<>Revenue")`],
    ["GOOG_P3_CONV_RT_guest_sauna_ALL",
      `=SUMIFS(${SP},'Platform Data'!F:F,"GOOG_P3_CONV_RT_guest_sauna_ALL",${SP},"<>Spend")`,
      `=SUMIFS(${PU},'Platform Data'!F:F,"GOOG_P3_CONV_RT_guest_sauna_ALL",${PU},"<>Purchases")`,
      `=SUMIFS(${RV},'Platform Data'!F:F,"GOOG_P3_CONV_RT_guest_sauna_ALL",${RV},"<>Revenue")`],
  ]
}

// ── Run ───────────────────────────────────────────────────────────────────
setup().catch(e => { console.error("❌", e.message); process.exit(1) })
