import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import type { GoogleAuth } from "google-auth-library"

import { fetchMetaInsights } from "@/lib/agent/meta-api"
import { fetchGoogleInsights } from "@/lib/agent/google-ads-api"
import { parseNamingConvention } from "@/lib/agent/naming-parser"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function getAuth(): GoogleAuth | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw) as Record<string, string>,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    })
  } catch { return null }
}

function getSetting(settings: { key: string; value: unknown }[], key: string): string | null {
  const row = settings.find(s => s.key === key)
  if (!row?.value) return null
  return String(row.value).replace(/^"|"$/g, "")
}

function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function fmt(n: number, dec = 2) { return n.toFixed(dec) }
function fmtPct(n: number) { return n.toFixed(2) + "%" }

// ── Cleaned report columns ─────────────────────────────────────────────────
// Structure: core metrics + parsed naming columns
export const CLEANED_HEADERS = [
  "Date", "Platform",
  "Campaign Name", "Ad Set Name", "Ad Name",
  "Phase", "Campaign Objective", "Funnel Stage",
  "Audience Type", "Audience Group", "Geo",
  "Space Type", "Audience Source", "Placement",
  "Test ID", "Variant", "Angle", "Format", "CTA",
  "Hook Copy", "Status", "Opt. Event",
  "Spend ($)", "Impressions", "Reach", "Link Clicks",
  "become_host_click", "host_onboarding_started", "listing_created", "Purchase",
  "Video Views 25%",
] as const

type RawRow = {
  date: string
  campaign_id: string; campaign_name: string
  adset_id: string;    adset_name: string
  ad_id: string;       ad_name: string
  spend: number; impressions: number; clicks: number
  purchases: number; revenue: number
  video_views_3s?: number
  video_views_50pct?: number
  video_views_100pct?: number
}

function cleanRow(raw: RawRow, platformFallback: string): string[] {
  const parsed = parseNamingConvention(raw.ad_name || raw.campaign_name)
  const platform = parsed.platform || platformFallback
  const phaseNum = parseInt(parsed.phase?.replace("P","") || "0")
  const isHost = parsed.audienceGroup === "Host"
  const optEvent = isHost
    ? (phaseNum===1 ? "become_host_click" : phaseNum===2 ? "host_onboarding_started" : "listing_created")
    : (phaseNum<=2 ? "ViewContent" : "Purchase")

  return [
    raw.date, platform,
    raw.campaign_name, raw.adset_name, raw.ad_name,
    parsed.phase, parsed.campaignObjective, parsed.funnelStage,
    parsed.audienceType, parsed.audienceGroup, parsed.geo,
    parsed.spaceType, parsed.audienceSource, parsed.placement,
    parsed.testId, parsed.variant, parsed.angle, parsed.format, parsed.cta,
    "", "", optEvent, // Hook Copy, Status filled from Creative Builder lookup in future
    fmt(raw.spend), String(raw.impressions), String(raw.impressions), String(raw.clicks),
    "0", "0", "0", String(raw.purchases), // conversion events
    String(raw.video_views_3s ?? 0),
  ]
}

// ── OpEx defaults ──────────────────────────────────────────────────────────

const OPEX_DEFAULTS = [
  // Item | Monthly $ | Category | Notes
  ["Redis (RedisLabs)",        "7.00",   "Infrastructure",  "Upstash or RedisLabs free tier"],
  ["Resend (Starter)",        "20.00",   "Infrastructure",  "Email API — up to 50k emails/mo"],
  ["Zoho Mail (Basic)",        "1.00",   "Infrastructure",  "hello@usethrml.com"],
  ["Domain / DNS",             "1.67",   "Infrastructure",  "$20/yr via Vercel"],
  ["Vercel (Hobby)",           "0.00",   "Infrastructure",  "Free tier"],
  ["Supabase (Free)",          "0.00",   "Infrastructure",  "Free tier"],
  ["Business Insurance",      "50.00",   "Operations",      "General liability — update with actual"],
  ["Stripe Fees",          "variable",   "Payment",         "2.9% + $0.30 per transaction"],
  ["Anthropic API",        "variable",   "AI",              "Claude API usage — check usage dashboard"],
  ["Midjourney",              "10.00",   "Creative",        "Basic plan — update if on Standard"],
  ["Cursor",                  "20.00",   "Development",     "Pro plan — update if on team"],
  ["Google Cloud",             "0.00",   "Infrastructure",  "Service account only — free"],
] as const

// ── Drive helpers ──────────────────────────────────────────────────────────

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  if (res.data.files?.[0]?.id) return res.data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  })
  return created.data.id!
}

async function writeOrUpdateDailySheet(
  drive: ReturnType<typeof google.drive>,
  sheets: ReturnType<typeof google.sheets>,
  folderId: string,
  fileName: string,
  headers: readonly string[],
  rows: string[][]
): Promise<void> {
  // Check if today's file already exists — update it if so
  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  const existingId = existing.data.files?.[0]?.id

  if (existingId) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: existingId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...headers], ...rows] },
    })
    return
  }

  // Create new sheet
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    fields: "id",
  })
  if (!created.data.id) return
  await sheets.spreadsheets.values.update({
    spreadsheetId: created.data.id,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: [[...headers], ...rows] },
  })
}

async function deleteOldFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  keepDays: number
): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - keepDays)
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and createdTime < '${cutoff.toISOString()}'`,
    fields: "files(id, name)",
  })
  let deleted = 0
  for (const file of res.data.files ?? []) {
    await drive.files.delete({ fileId: file.id! })
    deleted++
  }
  return deleted
}

// ── Master Report helpers ──────────────────────────────────────────────────

async function ensureMasterReportTabs(
  sheets: ReturnType<typeof google.sheets>,
  masterId: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: masterId })
  const existingTabs = new Set(meta.data.sheets?.map(s => s.properties?.title ?? "") ?? [])
  const requiredTabs = ["Daily Data", "P&L Dashboard", "OpEx", "Pivot"]

  const requests = requiredTabs
    .filter(t => !existingTabs.has(t))
    .map(title => ({ addSheet: { properties: { title } } }))

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: masterId,
      requestBody: { requests },
    })
  }
}

async function upsertDailyData(
  sheets: ReturnType<typeof google.sheets>,
  masterId: string,
  date: string,
  platform: string,
  newRows: string[][]
): Promise<void> {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: masterId, range: "Daily Data!A1:AZ50000",
  })
  const rows = existing.data.values ?? []
  // Keep header + rows that don't match this date+platform
  const kept = rows.filter((r, i) => i === 0 || !(r[0] === date && r[1] === platform))
  const updated = kept.length > 0 ? [...kept, ...newRows] : [[...CLEANED_HEADERS], ...newRows]
  await sheets.spreadsheets.values.update({
    spreadsheetId: masterId, range: "Daily Data!A1",
    valueInputOption: "RAW", requestBody: { values: updated },
  })
}

async function updateOpExTab(
  sheets: ReturnType<typeof google.sheets>,
  masterId: string
): Promise<void> {
  // Only write if tab is empty (don't overwrite user edits)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: masterId, range: "OpEx!A1:A2",
  })
  if ((existing.data.values ?? []).length > 0) return // already populated

  const headers = ["Item", "Monthly ($)", "Category", "Notes", "Annual ($)"]
  const rows = OPEX_DEFAULTS.map(([item, amount, cat, notes]) => {
    const annual = isNaN(Number(amount)) ? "variable" : (Number(amount) * 12).toFixed(2)
    return [item, amount, cat, notes, annual]
  })
  const totalFixed = OPEX_DEFAULTS
    .filter(([, amt]) => !isNaN(Number(amt)))
    .reduce((s, [, amt]) => s + Number(amt), 0)

  await sheets.spreadsheets.values.update({
    spreadsheetId: masterId, range: "OpEx!A1",
    valueInputOption: "RAW",
    requestBody: { values: [
      headers,
      ...rows,
      [],
      ["Total Fixed Monthly", totalFixed.toFixed(2), "", "", (totalFixed * 12).toFixed(2)],
    ]},
  })
}

async function updatePnLDashboard(
  sheets: ReturnType<typeof google.sheets>,
  admin: ReturnType<typeof createAdminClient>,
  masterId: string
): Promise<void> {
  // Pull Daily Data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: masterId, range: "Daily Data!A1:AZ50000",
  })
  const rows = res.data.values ?? []
  if (rows.length < 2) return

  const h = rows[0] as string[]
  const iDate = 0, iPlatform = 1
  const iSpend = h.indexOf("Spend")
  const iPurchases = h.indexOf("Purchases")
  const iRevenue = h.indexOf("Revenue")

  // Aggregate by date across platforms
  const byDate = new Map<string, { spend: number; revenue: number; purchases: number }>()
  for (const row of rows.slice(1)) {
    const date = row[iDate] ?? ""
    if (!date) continue
    const spend = parseFloat(row[iSpend] ?? "0") || 0
    const revenue = parseFloat(row[iRevenue] ?? "0") || 0
    const purchases = parseInt(row[iPurchases] ?? "0") || 0
    const prev = byDate.get(date) ?? { spend: 0, revenue: 0, purchases: 0 }
    byDate.set(date, { spend: prev.spend + spend, revenue: prev.revenue + revenue, purchases: prev.purchases + purchases })
  }

  // Get platform revenue from Supabase
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45)
  const { data: finRows } = await admin
    .from("finance_snapshots")
    .select("snapshot_date, net_platform_revenue, gross_booking_value, booking_count")
    .gte("snapshot_date", cutoff.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: true })

  const finMap = new Map((finRows ?? []).map(r => [r.snapshot_date, r]))

  // Fixed monthly OpEx
  const fixedMonthly = OPEX_DEFAULTS
    .filter(([, amt]) => !isNaN(Number(amt)))
    .reduce((s, [, amt]) => s + Number(amt), 0)
  const fixedDaily = fixedMonthly / 30

  const pnlHeaders = [
    "Date", "Ad Spend", "Platform Revenue (Net)", "Gross Booking Value",
    "Bookings", "Daily OpEx (est.)", "Gross Profit", "Profit Margin %",
    "ROAS", "CPB (Cost/Booking)",
  ]
  const pnlRows = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ads]) => {
      const fin = finMap.get(date)
      const netRev = Number(fin?.net_platform_revenue ?? 0)
      const grossBook = Number(fin?.gross_booking_value ?? 0)
      const bookings = Number(fin?.booking_count ?? 0)
      const profit = netRev - ads.spend - fixedDaily
      const margin = netRev > 0 ? (profit / netRev * 100) : 0
      const roas = ads.spend > 0 ? (netRev / ads.spend) : 0
      const cpb = bookings > 0 ? (ads.spend / bookings) : 0
      return [
        date, fmt(ads.spend), fmt(netRev), fmt(grossBook),
        String(bookings), fmt(fixedDaily),
        fmt(profit), fmtPct(margin),
        fmt(roas), fmt(cpb),
      ]
    })

  // Totals row
  const totals = pnlRows.reduce((acc, r) => ({
    spend: acc.spend + parseFloat(r[1]),
    rev: acc.rev + parseFloat(r[2]),
    gross: acc.gross + parseFloat(r[3]),
    bookings: acc.bookings + parseInt(r[4]),
    opex: acc.opex + parseFloat(r[5]),
    profit: acc.profit + parseFloat(r[6]),
  }), { spend: 0, rev: 0, gross: 0, bookings: 0, opex: 0, profit: 0 })

  await sheets.spreadsheets.values.update({
    spreadsheetId: masterId, range: "P&L Dashboard!A1",
    valueInputOption: "RAW",
    requestBody: { values: [
      pnlHeaders,
      ...pnlRows,
      [],
      ["TOTAL",
        fmt(totals.spend), fmt(totals.rev), fmt(totals.gross),
        String(totals.bookings), fmt(totals.opex), fmt(totals.profit),
        totals.rev > 0 ? fmtPct(totals.profit / totals.rev * 100) : "0%",
        totals.spend > 0 ? fmt(totals.rev / totals.spend) : "0",
        totals.bookings > 0 ? fmt(totals.spend / totals.bookings) : "0",
      ],
    ]},
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const auth = getAuth()
  if (!auth) {
    return NextResponse.json({ ok: true, skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set" })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs").insert({ agent_name: "reporting", status: "running" }).select("id").single()
  const runId = runRow?.id ?? null

  try {
    const drive = google.drive({ version: "v3", auth })
    const sheets = google.sheets({ version: "v4", auth })

    const { data: settingsRows } = await admin
      .from("platform_settings").select("key, value")
      .in("key", ["gdrive_reporting_folder_id", "gdrive_master_report_id",
                  "gdrive_raw_folder_id", "gdrive_cleaned_folder_id"])
    const settings = settingsRows ?? []

    const reportingFolderId = getSetting(settings, "gdrive_reporting_folder_id")
    if (!reportingFolderId) throw new Error("gdrive_reporting_folder_id not set")

    // Ensure Raw/ and Cleaned/ subfolders exist
    let rawFolderId = getSetting(settings, "gdrive_raw_folder_id")
    let cleanedFolderId = getSetting(settings, "gdrive_cleaned_folder_id")
    if (!rawFolderId) {
      rawFolderId = await getOrCreateFolder(drive, "Raw", reportingFolderId)
      await admin.from("platform_settings").upsert({ key: "gdrive_raw_folder_id", value: rawFolderId }, { onConflict: "key" })
    }
    if (!cleanedFolderId) {
      cleanedFolderId = await getOrCreateFolder(drive, "Cleaned", reportingFolderId)
      await admin.from("platform_settings").upsert({ key: "gdrive_cleaned_folder_id", value: cleanedFolderId }, { onConflict: "key" })
    }

    // Ensure Master Report has all required tabs + populate OpEx defaults
    const masterId = getSetting(settings, "gdrive_master_report_id")
    if (masterId) {
      await ensureMasterReportTabs(sheets, masterId)
      await updateOpExTab(sheets, masterId)
    }

    const date = yesterday()
    const results = { date, metaRows: 0, googleRows: 0, rawFiles: 0, cleanedFiles: 0, oldDeleted: 0 }

    // ── Meta ──────────────────────────────────────────────────────────────
    if (process.env.META_MARKETING_API_TOKEN && process.env.META_AD_ACCOUNT_ID) {
      try {
        const metaRaw = await fetchMetaInsights(date, "purchase")
        results.metaRows = metaRaw.length

        if (metaRaw.length > 0) {
          const normalized: RawRow[] = metaRaw.map(r => ({
            date, ...r, video_views_3s: 0, video_views_50pct: 0, video_views_100pct: 0,
          }))

          // Raw sheet
          const rawHeaders = Object.keys(normalized[0]) as string[]
          const rawRows = normalized.map(r => rawHeaders.map(h => String((r as Record<string, unknown>)[h] ?? "")))
          await writeOrUpdateDailySheet(drive, sheets, rawFolderId, `Meta_Raw_${date}`, rawHeaders, rawRows)
          results.rawFiles++

          // Cleaned sheet
          const cleanedRows = normalized.map(r => cleanRow(r, "Meta"))
          await writeOrUpdateDailySheet(drive, sheets, cleanedFolderId, `Meta_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
          results.cleanedFiles++

          if (masterId) await upsertDailyData(sheets, masterId, date, "Meta", cleanedRows)
        }
      } catch (e) { console.error("[agent-reporting] Meta error", e) }
    }

    // ── Google Ads ────────────────────────────────────────────────────────
    try {
      const googleRaw = await fetchGoogleInsights(date)
      results.googleRows = googleRaw.length

      if (googleRaw.length > 0) {
        const normalized: RawRow[] = googleRaw.map(r => ({
          date,
          campaign_id: r.campaign_id, campaign_name: r.campaign_name,
          adset_id: r.adgroup_id, adset_name: r.adgroup_name,
          ad_id: r.ad_id, ad_name: r.ad_name,
          spend: r.spend, impressions: r.impressions, clicks: r.clicks,
          purchases: r.purchases, revenue: r.revenue,
        }))

        const rawHeaders = Object.keys(normalized[0]) as string[]
        const rawRows = normalized.map(r => rawHeaders.map(h => String((r as Record<string, unknown>)[h] ?? "")))
        await writeOrUpdateDailySheet(drive, sheets, rawFolderId, `Google_Raw_${date}`, rawHeaders, rawRows)
        results.rawFiles++

        const cleanedRows = normalized.map(r => cleanRow(r, "Google"))
        await writeOrUpdateDailySheet(drive, sheets, cleanedFolderId, `Google_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
        results.cleanedFiles++

        if (masterId) await upsertDailyData(sheets, masterId, date, "Google", cleanedRows)
      }
    } catch (e) { console.error("[agent-reporting] Google Ads error (may not be configured)", e) }

    // ── P&L Dashboard ─────────────────────────────────────────────────────
    if (masterId) {
      try { await updatePnLDashboard(sheets, admin, masterId) }
      catch (e) { console.error("[agent-reporting] P&L error", e) }
    }

    // ── 45-day retention ──────────────────────────────────────────────────
    results.oldDeleted =
      await deleteOldFiles(drive, rawFolderId, 45) +
      await deleteOldFiles(drive, cleanedFolderId, 45)

    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, results,
    }).eq("id", runId)

    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) await admin.from("agent_runs").update({
      status: "error", completed_at: new Date().toISOString(),
      duration_ms: Date.now() - runStart, error_message: msg,
    }).eq("id", runId)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
