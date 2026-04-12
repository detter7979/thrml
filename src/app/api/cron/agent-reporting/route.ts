import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import type { GoogleAuth } from "google-auth-library"

import { fetchMetaInsights } from "@/lib/agent/meta-api"
import { fetchGoogleInsights } from "@/lib/agent/google-ads-api"
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
    const creds = JSON.parse(raw) as Record<string, string>
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
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

// 45-day lookback window
function getLookbackDates(days = 45): string[] {
  const dates: string[] = []
  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Namer lookup ────────────────────────────────────────────────────────────
type NamerRow = {
  id: string
  name: string
  platform: string
  campaignType: string
  goal: string
  market: string
}

async function loadNamerLookup(
  sheets: ReturnType<typeof google.sheets>,
  namerId: string
): Promise<Map<string, NamerRow>> {
  const map = new Map<string, NamerRow>()
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: namerId,
      range: "Namer!A2:F1000",
    })
    for (const row of res.data.values ?? []) {
      const id = String(row[0] ?? "").trim()
      if (!id) continue
      map.set(id, {
        id,
        name: String(row[1] ?? id),
        platform: String(row[2] ?? ""),
        campaignType: String(row[3] ?? ""),
        goal: String(row[4] ?? ""),
        market: String(row[5] ?? ""),
      })
    }
  } catch (e) {
    console.error("[agent-reporting] Namer load failed", e)
  }
  return map
}

// ── Raw insight → Cleaned row ───────────────────────────────────────────────
type RawRow = {
  date: string
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  spend: number
  impressions: number
  clicks: number
  purchases: number
  revenue: number
  video_views_3s?: number
  video_views_50pct?: number
  video_views_100pct?: number
}

type CleanedRow = [
  string, string, string, string, string, string, string, string,
  string, string, string,
  string, string, string, string, string, string,
  string, string, string, string,
  string, string, string, string, string
]

function cleanRow(raw: RawRow, platform: string, namer: Map<string, NamerRow>): CleanedRow {
  const camp = namer.get(raw.campaign_id) ?? namer.get(raw.campaign_name)
  const adset = namer.get(raw.adset_id) ?? namer.get(raw.adset_name)
  const ad = namer.get(raw.ad_id) ?? namer.get(raw.ad_name)

  const spend = raw.spend
  const imps = raw.impressions
  const clicks = raw.clicks
  const purchases = raw.purchases
  const revenue = raw.revenue

  const ctr = imps > 0 ? (clicks / imps * 100) : 0
  const cpm = imps > 0 ? (spend / imps * 1000) : 0
  const cpc = clicks > 0 ? (spend / clicks) : 0
  const roas = spend > 0 ? (revenue / spend) : 0
  const cpa = purchases > 0 ? (spend / purchases) : 0

  const v3s = raw.video_views_3s ?? 0
  const v50 = raw.video_views_50pct ?? 0
  const v100 = raw.video_views_100pct ?? 0
  const vtr = imps > 0 ? (v3s / imps * 100) : 0
  const thumbstop = imps > 0 ? (v3s / imps * 100) : 0

  const fmt = (n: number, dec = 2) => n.toFixed(dec)
  const fmtPct = (n: number) => n.toFixed(2) + "%"

  return [
    raw.date, platform,
    raw.campaign_id, camp?.name ?? raw.campaign_name,
    raw.adset_id, adset?.name ?? raw.adset_name,
    raw.ad_id, ad?.name ?? raw.ad_name,
    camp?.campaignType ?? "", camp?.goal ?? "", camp?.market ?? "",
    fmt(spend), String(imps), String(clicks),
    fmtPct(ctr), fmt(cpm), fmt(cpc),
    String(purchases), fmt(revenue), fmt(roas), fmt(cpa),
    String(v3s), String(v50), String(v100),
    fmtPct(vtr), fmtPct(thumbstop),
  ]
}

const CLEANED_HEADERS: string[] = [
  "Date", "Platform",
  "Campaign ID", "Campaign Name",
  "Ad Set ID", "Ad Set Name",
  "Ad ID", "Ad Name",
  "Campaign Type", "Goal", "Market",
  "Spend", "Impressions", "Clicks",
  "CTR", "CPM", "CPC",
  "Purchases", "Revenue", "ROAS", "CPA",
  "Video Views (3s)", "Video Views (50%)", "Video Views (100%)",
  "VTR", "Thumbstop Rate",
]

// ── Drive helpers ────────────────────────────────────────────────────────────

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  // Check if folder exists
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id, name)",
  })
  if (res.data.files?.[0]?.id) return res.data.files[0].id
  // Create it
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  })
  return created.data.id!
}

async function writeSheetToFolder(
  drive: ReturnType<typeof google.drive>,
  sheets: ReturnType<typeof google.sheets>,
  folderId: string,
  fileName: string,
  headers: string[],
  rows: string[][]
): Promise<string | null> {
  // Create a new Google Sheet in the folder
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    fields: "id",
  })
  const sheetId = created.data.id
  if (!sheetId) return null

  // Write headers + data
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Sheet1!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers, ...rows] },
  })

  return sheetId
}

async function deleteOldFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  keepDays: number
): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - keepDays)
  const cutoffStr = cutoff.toISOString()

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and createdTime < '${cutoffStr}'`,
    fields: "files(id, name, createdTime)",
  })

  let deleted = 0
  for (const file of res.data.files ?? []) {
    await drive.files.delete({ fileId: file.id! })
    deleted++
  }
  return deleted
}

// ── Master Report upsert ─────────────────────────────────────────────────────

async function upsertMasterDailyData(
  sheets: ReturnType<typeof google.sheets>,
  masterSheetId: string,
  date: string,
  platform: string,
  cleanedRows: string[][]
): Promise<void> {
  // Get existing data
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "Daily Data!A1:Z10000",
  })
  const existingRows = existing.data.values ?? []

  // Remove rows that match this date+platform (will be replaced)
  const kept = existingRows.filter((row, i) => {
    if (i === 0) return true // keep header
    return !(row[0] === date && row[1] === platform)
  })

  // Append new rows
  const updated = [...kept, ...cleanedRows]

  // Write back
  await sheets.spreadsheets.values.update({
    spreadsheetId: masterSheetId,
    range: "Daily Data!A1",
    valueInputOption: "RAW",
    requestBody: { values: updated },
  })
}

async function updatePnLDashboard(
  sheets: ReturnType<typeof google.sheets>,
  admin: ReturnType<typeof createAdminClient>,
  masterSheetId: string
): Promise<void> {
  // Pull last 30 days of data from Daily Data tab
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: masterSheetId,
    range: "Daily Data!A1:Z10000",
  })
  const rows = res.data.values ?? []
  if (rows.length < 2) return

  const headers = rows[0]
  const spendIdx = headers.indexOf("Spend")
  const revenueIdx = headers.indexOf("Revenue")
  const purchasesIdx = headers.indexOf("Purchases")
  const dateIdx = 0

  // Aggregate by date
  const byDate = new Map<string, { spend: number; revenue: number; purchases: number }>()
  for (const row of rows.slice(1)) {
    const date = row[dateIdx] ?? ""
    const spend = parseFloat(row[spendIdx] ?? "0") || 0
    const revenue = parseFloat(row[revenueIdx] ?? "0") || 0
    const purchases = parseInt(row[purchasesIdx] ?? "0") || 0
    const prev = byDate.get(date) ?? { spend: 0, revenue: 0, purchases: 0 }
    byDate.set(date, {
      spend: prev.spend + spend,
      revenue: prev.revenue + revenue,
      purchases: prev.purchases + purchases,
    })
  }

  // Get platform revenue from Supabase finance_snapshots for accurate P&L
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 45)
  const { data: financeRows } = await admin
    .from("finance_snapshots")
    .select("snapshot_date, net_platform_revenue, gross_booking_value, booking_count")
    .gte("snapshot_date", cutoff.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: true })

  const financeMap = new Map((financeRows ?? []).map(r => [
    r.snapshot_date,
    { netRevenue: Number(r.net_platform_revenue), grossBookings: Number(r.gross_booking_value), bookings: r.booking_count }
  ]))

  // Build P&L rows
  const pnlHeaders = ["Date", "Ad Spend", "Platform Revenue", "Gross Booking Value",
    "Bookings", "Ad Spend ROAS", "Gross Profit", "Profit Margin %"]
  const pnlRows = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ads]) => {
      const fin = financeMap.get(date) ?? { netRevenue: 0, grossBookings: 0, bookings: 0 }
      const profit = fin.netRevenue - ads.spend
      const margin = fin.netRevenue > 0 ? (profit / fin.netRevenue * 100) : 0
      const roas = ads.spend > 0 ? (fin.netRevenue / ads.spend) : 0
      return [
        date,
        ads.spend.toFixed(2),
        fin.netRevenue.toFixed(2),
        fin.grossBookings.toFixed(2),
        String(fin.bookings),
        roas.toFixed(2),
        profit.toFixed(2),
        margin.toFixed(1) + "%",
      ]
    })

  await sheets.spreadsheets.values.update({
    spreadsheetId: masterSheetId,
    range: "P&L Dashboard!A1",
    valueInputOption: "RAW",
    requestBody: { values: [pnlHeaders, ...pnlRows] },
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

    // Load settings
    const { data: settingsRows } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "gdrive_reporting_folder_id",
        "gdrive_namer_sheet_id",
        "gdrive_master_report_id",
        "gdrive_raw_folder_id",
        "gdrive_cleaned_folder_id",
      ])
    const settings = settingsRows ?? []

    const reportingFolderId = getSetting(settings, "gdrive_reporting_folder_id")
    if (!reportingFolderId) {
      throw new Error("gdrive_reporting_folder_id not set in platform_settings")
    }

    // Get or create Raw/ and Cleaned/ subfolders
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

    // Load Namer lookup
    const namerId = getSetting(settings, "gdrive_namer_sheet_id")
    const namer = namerId ? await loadNamerLookup(sheets, namerId) : new Map<string, NamerRow>()

    const date = yesterday()
    const results = {
      date,
      metaRows: 0, googleRows: 0,
      rawFilesCreated: 0, cleanedFilesCreated: 0,
      oldFilesDeleted: 0,
    }

    // ── Meta ──────────────────────────────────────────────────────────────
    if (process.env.META_MARKETING_API_TOKEN && process.env.META_AD_ACCOUNT_ID) {
      try {
        const metaRaw = await fetchMetaInsights(date, "purchase")
        results.metaRows = metaRaw.length

        if (metaRaw.length > 0) {
          // Raw file
          const rawHeaders = ["date","campaign_id","campaign_name","adset_id","adset_name",
            "ad_id","ad_name","spend","impressions","clicks","purchases","revenue",
            "video_views_3s","video_views_50pct","video_views_100pct"]
          const rawRowsNorm: RawRow[] = metaRaw.map(r => ({ ...r, date, video_views_3s: 0, video_views_50pct: 0, video_views_100pct: 0 }))
          const rawRows = rawRowsNorm.map(r => rawHeaders.map(h => String((r as Record<string, unknown>)[h] ?? "")))
          await writeSheetToFolder(drive, sheets, rawFolderId, `Meta_Raw_${date}`, rawHeaders, rawRows)
          results.rawFilesCreated++

          // Cleaned file
          const cleanedRows = rawRowsNorm.map(r => cleanRow(r, "Meta", namer))
          await writeSheetToFolder(drive, sheets, cleanedFolderId, `Meta_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
          results.cleanedFilesCreated++

          // Update Master Report
          const masterId = getSetting(settings, "gdrive_master_report_id")
          if (masterId) {
            await upsertMasterDailyData(sheets, masterId, date, "Meta", [
              CLEANED_HEADERS,
              ...cleanedRows,
            ])
          }
        }
      } catch (e) {
        console.error("[agent-reporting] Meta error", e)
      }
    }

    // ── Google Ads ────────────────────────────────────────────────────────
    try {
      const googleRaw = await fetchGoogleInsights(date)
      results.googleRows = googleRaw.length

      if (googleRaw.length > 0) {
        const rawHeaders = ["date","campaign_id","campaign_name","adset_id","adset_name",
          "ad_id","ad_name","spend","impressions","clicks","purchases","revenue"]
        // Google uses adgroup_id/name — normalize to adset for unified schema
        const rawRowsNorm: RawRow[] = googleRaw.map(r => ({
          date,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          adset_id: r.adgroup_id,
          adset_name: r.adgroup_name,
          ad_id: r.ad_id,
          ad_name: r.ad_name,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          purchases: r.purchases,
          revenue: r.revenue,
        }))
        const rawRows = rawRowsNorm.map(r => rawHeaders.map(h => String((r as Record<string, unknown>)[h] ?? "")))
        await writeSheetToFolder(drive, sheets, rawFolderId, `Google_Raw_${date}`, rawHeaders, rawRows)
        results.rawFilesCreated++

        const cleanedRows = rawRowsNorm.map(r => cleanRow(r, "Google", namer))
        await writeSheetToFolder(drive, sheets, cleanedFolderId, `Google_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
        results.cleanedFilesCreated++

        const masterId = getSetting(settings, "gdrive_master_report_id")
        if (masterId) {
          await upsertMasterDailyData(sheets, masterId, date, "Google", [
            CLEANED_HEADERS,
            ...cleanedRows,
          ])
        }
      }
    } catch (e) {
      console.error("[agent-reporting] Google Ads error — may not be configured", e)
    }

    // ── Update P&L Dashboard ──────────────────────────────────────────────
    const masterId = getSetting(settings, "gdrive_master_report_id")
    if (masterId) {
      try {
        await updatePnLDashboard(sheets, admin, masterId)
      } catch (e) {
        console.error("[agent-reporting] P&L dashboard update error", e)
      }
    }

    // ── Enforce 45-day retention ──────────────────────────────────────────
    const deleted = await deleteOldFiles(drive, rawFolderId, 45)
      + await deleteOldFiles(drive, cleanedFolderId, 45)
    results.oldFilesDeleted = deleted

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
