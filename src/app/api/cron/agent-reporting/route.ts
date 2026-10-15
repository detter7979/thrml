import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import type { GoogleAuth } from "google-auth-library"

import { fetchMetaInsights } from "@/lib/agent/meta-api"
import { fetchGoogleInsights } from "@/lib/agent/google-ads-api"
import {
  CLEANED_HEADERS,
  cleanRow,
  type RawRow,
  upsertPlatformData,
} from "@/lib/finance/platform-data-sheet"
import { loadGoogleServiceAccountCredentials } from "@/lib/google-service-account"
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
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null
  return new google.auth.GoogleAuth({
    credentials: loadGoogleServiceAccountCredentials(),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  })
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


// ── Drive helpers ──────────────────────────────────────────────────────────
async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string, parentId: string
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
  folderId: string, fileName: string,
  headers: readonly string[], rows: string[][]
): Promise<void> {
  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  })
  const existingId = existing.data.files?.[0]?.id
  const values = [[...headers], ...rows]

  if (existingId) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: existingId, range: "Sheet1!A1",
      valueInputOption: "RAW", requestBody: { values },
    })
    return
  }
  const created = await drive.files.create({
    requestBody: { name: fileName, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
    fields: "id",
  })
  if (!created.data.id) return
  await sheets.spreadsheets.values.update({
    spreadsheetId: created.data.id, range: "Sheet1!A1",
    valueInputOption: "RAW", requestBody: { values },
  })
}

async function deleteOldFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string, keepDays: number
): Promise<number> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - keepDays)
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and createdTime < '${cutoff.toISOString()}'`,
    fields: "files(id)",
  })
  let deleted = 0
  for (const f of res.data.files ?? []) {
    // Move to trash rather than hard-delete, and skip files the service account can't
    // remove (e.g. files owned by someone else). One un-deletable file used to fail the
    // whole daily report with "insufficient permissions".
    try {
      await drive.files.update({ fileId: f.id!, requestBody: { trashed: true } })
      deleted++
    } catch (e) {
      console.warn("[agent-reporting] could not trash old file", f.id, e instanceof Error ? e.message : e)
    }
  }
  return deleted
}

// ── Master Report helpers ──────────────────────────────────────────────────
// ── Master Report helpers ──────────────────────────────────────────────────
async function ensureMasterReportTabs(
  sheets: ReturnType<typeof google.sheets>, masterId: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: masterId })
  const existing = new Set(meta.data.sheets?.map(s => s.properties?.title ?? "") ?? [])
  const required = ["Platform Data"]
  const requests = required.filter(t => !existing.has(t)).map(title => ({ addSheet: { properties: { title } } }))
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: masterId, requestBody: { requests } })
  }
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const auth = getAuth()
  if (!auth) return NextResponse.json({ ok: true, skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set" })

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin.from("agent_runs").insert({ agent_name: "reporting", status: "running" }).select("id").single()
  const runId = runRow?.id ?? null

  try {
    const drive = google.drive({ version: "v3", auth })
    const sheets = google.sheets({ version: "v4", auth })

    const { data: settingsRows } = await admin.from("platform_settings").select("key, value")
      .in("key", ["gdrive_reporting_folder_id","gdrive_master_report_id","gdrive_raw_folder_id","gdrive_cleaned_folder_id"])
    const settings = settingsRows ?? []

    const reportingFolderId = getSetting(settings, "gdrive_reporting_folder_id")
    if (!reportingFolderId) throw new Error("gdrive_reporting_folder_id not set")

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

    const masterId = getSetting(settings, "gdrive_master_report_id")
    if (masterId) {
      await step("master report tabs", () => ensureMasterReportTabs(sheets, masterId))
    }

    const date = yesterday()
    const results = { date, metaRows: 0, googleRows: 0, rawFiles: 0, cleanedFiles: 0, oldDeleted: 0 }

    // ── Meta ──────────────────────────────────────────────────────────────
    if (process.env.META_MARKETING_API_TOKEN && process.env.META_AD_ACCOUNT_ID) {
      try {
        const metaRaw = await fetchMetaInsights(date, "purchase")
        results.metaRows = metaRaw.length
        if (metaRaw.length > 0) {
          const normalized: RawRow[] = metaRaw.map(r => ({ date, ...r, video_views_100pct: 0 }))
          const rawHeaders = Object.keys(normalized[0]) as string[]
          const rawRows = normalized.map(r => rawHeaders.map(h => String((r as Record<string, unknown>)[h] ?? "")))
          await writeOrUpdateDailySheet(drive, sheets, rawFolderId, `Meta_Raw_${date}`, rawHeaders, rawRows)
          results.rawFiles++
          const cleanedRows = normalized.map(r => cleanRow(r, "Meta"))
          await writeOrUpdateDailySheet(drive, sheets, cleanedFolderId, `Meta_Cleaned_${date}`, CLEANED_HEADERS, cleanedRows)
          results.cleanedFiles++
          if (masterId) await upsertPlatformData(sheets, masterId, date, "Meta", cleanedRows)
        }
      } catch (e) { console.error("[agent-reporting] Meta error", e) }
    }

    // ── Google Ads ────────────────────────────────────────────────────────
    try {
      const googleRaw = await fetchGoogleInsights(date)
      results.googleRows = googleRaw.length
      if (googleRaw.length > 0) {
        const normalized: RawRow[] = googleRaw.map(r => ({
          date, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
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
        if (masterId) await upsertPlatformData(sheets, masterId, date, "Google", cleanedRows)
      }
    } catch (e) { console.error("[agent-reporting] Google Ads error", e) }

    // P&L Dashboard is a formula tab rebuilt with the Executive Summary (rebuild-finance-tracker);
    // this job used to overwrite it with a daily table, which broke the Executive Summary.

    // ── 45-day retention ──────────────────────────────────────────────────
    results.oldDeleted = await step("old file cleanup", async () =>
      (await deleteOldFiles(drive, rawFolderId, 45)) + (await deleteOldFiles(drive, cleanedFolderId, 45))
    )

    if (runId) await admin.from("agent_runs").update({
      status: "success", completed_at: new Date().toISOString(), duration_ms: Date.now() - runStart, results,
    }).eq("id", runId)
    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) await admin.from("agent_runs").update({
      status: "error", completed_at: new Date().toISOString(), duration_ms: Date.now() - runStart, error_message: msg,
    }).eq("id", runId)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
