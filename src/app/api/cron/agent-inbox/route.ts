import { NextRequest, NextResponse } from "next/server"

import { callAgentJson } from "@/lib/agent/claude"
import { createAdminClient } from "@/lib/supabase/admin"

function cronAuth(req: NextRequest) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null
  )
}

type EmailCategory =
  | "support_request" | "host_inquiry" | "partnership"
  | "spam" | "internal" | "other"

type ClassifiedEmail = {
  category: EmailCategory
  draft_reply: string | null
  reasoning: string
}

// ── Zoho token management ──────────────────────────────────────────────────

async function refreshZohoToken(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data: settings } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["zoho_refresh_token", "zoho_access_token", "zoho_token_expiry",
                "zoho_client_id", "zoho_client_secret"])

  const byKey = new Map((settings ?? []).map(s => [s.key, (s.value as string).replace(/^"|"$/g, "")]))
  const refreshToken = byKey.get("zoho_refresh_token")
  if (!refreshToken) return null

  // Return cached token if still valid (5 min buffer)
  const expiry = byKey.get("zoho_token_expiry")
  if (expiry && Date.now() < Number(expiry) - 300_000) {
    return byKey.get("zoho_access_token") ?? null
  }

  // Read client credentials from env first, fall back to Supabase
  const clientId = process.env.ZOHO_CLIENT_ID ?? byKey.get("zoho_client_id")
  const clientSecret = process.env.ZOHO_CLIENT_SECRET ?? byKey.get("zoho_client_secret")
  if (!clientId || !clientSecret) return null

  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    console.error("[agent-inbox] Zoho token refresh failed", res.status)
    return null
  }

  const data = await res.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
  await admin.from("platform_settings").upsert([
    { key: "zoho_access_token", value: data.access_token },
    { key: "zoho_token_expiry", value: String(newExpiry) },
  ], { onConflict: "key" })

  return data.access_token
}

// ── Zoho API helpers ───────────────────────────────────────────────────────

async function getZohoAccountId(token: string): Promise<string | null> {
  const res = await fetch("https://mail.zoho.com/api/accounts", {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json() as { data?: { accountId: string }[] }
  return data?.data?.[0]?.accountId ?? null
}

async function fetchUnreadMessages(token: string, accountId: string): Promise<ZohoMessage[]> {
  const res = await fetch(
    `https://mail.zoho.com/api/accounts/${accountId}/messages/view?limit=20&status=unread&folderId=INBOX`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!res.ok) return []
  const data = await res.json() as { data?: ZohoMessage[] }
  return data?.data ?? []
}

async function getMessageBody(token: string, accountId: string, messageId: string): Promise<string> {
  const res = await fetch(
    `https://mail.zoho.com/api/accounts/${accountId}/messages/${messageId}/content`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!res.ok) return ""
  const data = await res.json() as { data?: { content?: string } }
  const html = data?.data?.content ?? ""
  // Strip HTML tags for Claude
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000)
}

async function markAsRead(token: string, accountId: string, messageId: string): Promise<void> {
  await fetch(
    `https://mail.zoho.com/api/accounts/${accountId}/updatemessage`,
    {
      method: "PUT",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId, isRead: true }),
    }
  )
}

type ZohoMessage = {
  messageId: string
  subject: string
  fromAddress: string
  sender: string
  summary: string
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || cronAuth(req) !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const runStart = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "inbox", status: "running" })
    .select("id").single()
  const runId = runRow?.id ?? null

  const results = { processed: 0, support: 0, host_inquiry: 0, partnership: 0, spam: 0, other: 0, errors: 0 }

  try {
    // Check if Zoho is configured (env or Supabase)
    const hasEnvCreds = !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET)
    const { count: hasSupaCreds } = await admin
      .from("platform_settings")
      .select("key", { count: "exact", head: true })
      .in("key", ["zoho_client_id", "zoho_client_secret"])
    if (!hasEnvCreds && (hasSupaCreds ?? 0) < 2) {
      if (runId) await admin.from("agent_runs").update({
        status: "skipped", completed_at: new Date().toISOString(),
        results: { reason: "ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not set" },
      }).eq("id", runId)
      return NextResponse.json({ ok: true, skipped: true, reason: "Zoho not configured" })
    }

    const token = await refreshZohoToken(admin)
    if (!token) {
      throw new Error("Could not obtain Zoho access token — check zoho_refresh_token in platform_settings")
    }

    // Get account ID (cached in platform_settings)
    const { data: acctSetting } = await admin
      .from("platform_settings").select("value").eq("key", "zoho_account_id").maybeSingle()
    let accountId = acctSetting?.value as string | undefined
    if (!accountId) {
      accountId = await getZohoAccountId(token) ?? undefined
      if (accountId) {
        await admin.from("platform_settings").upsert({ key: "zoho_account_id", value: accountId }, { onConflict: "key" })
      }
    }
    if (!accountId) throw new Error("Could not resolve Zoho account ID")

    const messages = await fetchUnreadMessages(token, accountId)

    for (const msg of messages) {
      try {
        results.processed++
        const body = await getMessageBody(token, accountId, msg.messageId)
        const fromEmail = msg.fromAddress ?? ""
        const subject = msg.subject ?? "(no subject)"

        // Skip internal notifications silently
        const internalDomains = ["stripe.com", "supabase.io", "resend.com", "vercel.com", "github.com", "zoho.com"]
        if (internalDomains.some(d => fromEmail.includes(d))) {
          await markAsRead(token, accountId, msg.messageId)
          continue
        }

        // Classify with Claude
        const classified = await callAgentJson<ClassifiedEmail>({
          skill: "email-inbox",
          maxTokens: 600,
          prompt: `Classify this email and draft a reply if needed.

FROM: ${fromEmail}
SUBJECT: ${subject}
BODY: ${body || msg.summary || "(no body)"}

Return JSON:
{
  "category": "<support_request|host_inquiry|partnership|spam|internal|other>",
  "draft_reply": "<reply text or null if no reply needed>",
  "reasoning": "<one sentence>"
}`,
        })

        const category = classified?.category ?? "other"
        const draftReply = classified?.draft_reply ?? null

        // Route based on category
        if (category === "spam" || category === "internal") {
          await markAsRead(token, accountId, msg.messageId)
          results.other++
          continue
        }

        // Save draft reply
        if (draftReply) {
          await admin.from("inbox_drafts").insert({
            zoho_message_id: msg.messageId,
            from_email: fromEmail,
            from_name: msg.sender ?? null,
            subject,
            original_body: body.slice(0, 5000),
            category,
            draft_reply: draftReply,
            send_to: fromEmail,
          })
        }

        // Additional routing
        if (category === "support_request") {
          results.support++
          await admin.from("support_requests").insert({
            name: msg.sender ?? fromEmail,
            email: fromEmail,
            subject,
            message: body.slice(0, 3000),
            status: "open",
            source: "email_inbox",
          })
        } else if (category === "host_inquiry") {
          results.host_inquiry++
          await admin.from("ops_alerts").insert({
            severity: "INFO", category: "inbox",
            message: `Host inquiry from ${fromEmail}: "${subject}"`,
            details: { from: fromEmail, subject, message_id: msg.messageId },
          })
        } else if (category === "partnership") {
          results.partnership++
          await admin.from("ops_alerts").insert({
            severity: "INFO", category: "inbox",
            message: `Partnership/PR inquiry from ${fromEmail}: "${subject}"`,
            details: { from: fromEmail, subject, message_id: msg.messageId },
          })
        } else {
          results.other++
          await admin.from("ops_alerts").insert({
            severity: "INFO", category: "inbox",
            message: `Unclassified email from ${fromEmail}: "${subject}"`,
            details: { from: fromEmail, subject, category, reasoning: classified?.reasoning },
          })
        }

        await markAsRead(token, accountId, msg.messageId)
      } catch (msgErr) {
        results.errors++
        console.error("[agent-inbox] message error", msg.messageId, msgErr)
      }
    }

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
