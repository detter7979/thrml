import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import type { GoogleAuth } from "google-auth-library"

import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

function getGoogleAuth(): GoogleAuth | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const creds = JSON.parse(raw) as Record<string, string>
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
      ],
    })
  } catch { return null }
}

async function getOrCreateSheetId(
  admin: ReturnType<typeof createAdminClient>,
  auth: GoogleAuth,
  folderId: string | null
): Promise<string | null> {
  // Check if a sheet ID is already stored (either pre-created or from a prior run)
  const { data: setting } = await admin
    .from("platform_settings").select("value").eq("key", "gdrive_finance_sheet_id").maybeSingle()
  if (setting?.value) return String(setting.value).replace(/^"|"$/g, "")

  // No sheet ID stored — agent cannot create one (service account quota limits).
  // Solution: create the sheet manually in your Google Drive, share it with
  // thrml-agent@watchful-muse-350902.iam.gserviceaccount.com (Editor),
  // then store the sheet ID:
  //   INSERT INTO platform_settings (key, value)
  //   VALUES ('gdrive_finance_sheet_id', '"YOUR_SHEET_ID"')
  //   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  console.error("[agent-gdrive] No gdrive_finance_sheet_id in platform_settings. Create sheet manually and store ID.")
  return null
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ ok: true, skipped: true, reason: "GOOGLE_SERVICE_ACCOUNT_JSON not set" })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs").insert({ agent_name: "gdrive-sync", status: "running" }).select("id").single()
  const runId = runRow?.id ?? null

  try {
    const auth = getGoogleAuth()
    if (!auth) throw new Error("Google auth init failed — check GOOGLE_SERVICE_ACCOUNT_JSON format")

    const { data: folderSetting } = await admin
      .from("platform_settings").select("value").eq("key", "gdrive_folder_id").maybeSingle()
    const folderId = folderSetting?.value
      ? String(folderSetting.value).replace(/^"|"$/g, "")
      : null

    const spreadsheetId = await getOrCreateSheetId(admin, auth, folderId)
    if (!spreadsheetId) throw new Error("Could not create/find Google Sheet")

    const { data: snapshots } = await admin
      .from("finance_snapshots").select("*").order("snapshot_date", { ascending: true })

    if (!snapshots?.length) {
      if (runId) await admin.from("agent_runs").update({
        status: "success", completed_at: new Date().toISOString(), results: { rows: 0 },
      }).eq("id", runId)
      return NextResponse.json({ ok: true, rows: 0 })
    }

    const sheets = google.sheets({ version: "v4", auth })

    // Write headers first (idempotent — just overwrites row 1 each time)
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: "Sheet1!A1:H1", valueInputOption: "RAW",
      requestBody: {
        values: [["Date","Bookings","Gross","Platform Rev","Host Payouts","Refunds","Net Rev","New Users"]],
      },
    })

    const rows = snapshots.map(s => [
      s.snapshot_date, s.booking_count,
      Number(s.gross_booking_value).toFixed(2), Number(s.platform_revenue).toFixed(2),
      Number(s.host_payouts).toFixed(2), Number(s.refunds_issued).toFixed(2),
      Number(s.net_platform_revenue).toFixed(2), s.new_users,
    ])

    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `Sheet1!A2:H${rows.length + 1}`,
      valueInputOption: "RAW", requestBody: { values: rows },
    })

    const results = { rows: rows.length, spreadsheetId }
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
