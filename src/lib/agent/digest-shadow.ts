/**
 * House-team shadow for the morning digest.
 *
 * The email is a template. This module asks AI Gateway for a second reading
 * of the same facts and returns text that the cron stores on agent_runs.
 * Callers must not interpolate the text into the email.
 */

export const DIGEST_TEAM = "house"

export type DigestFacts = {
  date: string
  netPlatformRevenue: number | null
  bookingCount: number
  bookingRevenue: number
  pendingTickets: number
  pendingSocial: number
  criticalCount: number
  warningCount: number
  infoCount: number
  alertLines: string[]
  agentRunLines: string[]
}

export type DigestShadowRecord = {
  status: "skipped" | "recorded" | "failed"
  model: string | null
  text: string | null
  reason: string | null
}

export type DigestRunResults = {
  team: typeof DIGEST_TEAM
  emailSent: true
  date: string
  live: {
    source: "template"
    netPlatformRevenue: number | null
    bookingCount: number
    bookingRevenue: number
    pendingTickets: number
    pendingSocial: number
    criticalCount: number
    warningCount: number
    infoCount: number
  }
  shadow: DigestShadowRecord
}

const SHADOW_SYSTEM = [
  "You are the House team shadow for thrml's morning digest.",
  "Summarize the facts in short, specific sentences.",
  "Use only the numbers in the prompt. Do not invent metrics.",
  "Do not recommend refunds, ad changes, payouts, or emails to guests or hosts.",
  "This summary is stored for comparison. It is not sent to anyone.",
].join(" ")

type ShadowEnv = Record<string, string | undefined>

export function shadowModel(env: ShadowEnv): string | null {
  return env.AGENT_SHADOW_MODEL?.trim() || env.AI_GATEWAY_MODEL?.trim() || null
}

export function shadowCredential(env: ShadowEnv): string | null {
  return env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || null
}

/** Null means the shadow should run. Any string is a skip reason. */
export function shadowSkipReason(env: ShadowEnv): string | null {
  if (env.AGENT_SHADOW_DIGEST !== "1") return "AGENT_SHADOW_DIGEST is not 1"
  if (!shadowModel(env)) return "AGENT_SHADOW_MODEL is unset"
  if (!shadowCredential(env)) return "AI Gateway credentials are unset"
  return null
}

export function buildDigestShadowPrompt(facts: DigestFacts): string {
  return [
    `Date: ${facts.date}`,
    `Net platform revenue yesterday: ${facts.netPlatformRevenue ?? "missing"}`,
    `New bookings: ${facts.bookingCount}`,
    `Booking total charged: ${facts.bookingRevenue}`,
    `Open support tickets: ${facts.pendingTickets}`,
    `Content items queued: ${facts.pendingSocial}`,
    `Alerts: ${facts.criticalCount} critical, ${facts.warningCount} warning, ${facts.infoCount} info`,
    facts.alertLines.length ? `Alert lines:\n${facts.alertLines.join("\n")}` : "Alert lines: none",
    facts.agentRunLines.length
      ? `Agent runs:\n${facts.agentRunLines.join("\n")}`
      : "Agent runs: none",
    "Write the comparison summary now.",
  ].join("\n")
}

export function digestRunResults(facts: DigestFacts, shadow: DigestShadowRecord): DigestRunResults {
  return {
    team: DIGEST_TEAM,
    emailSent: true,
    date: facts.date,
    live: {
      source: "template",
      netPlatformRevenue: facts.netPlatformRevenue,
      bookingCount: facts.bookingCount,
      bookingRevenue: facts.bookingRevenue,
      pendingTickets: facts.pendingTickets,
      pendingSocial: facts.pendingSocial,
      criticalCount: facts.criticalCount,
      warningCount: facts.warningCount,
      infoCount: facts.infoCount,
    },
    shadow,
  }
}

export function readGatewayCompletionText(body: unknown): string {
  if (!body || typeof body !== "object") return ""
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0 || typeof choices[0] !== "object" || !choices[0]) {
    return ""
  }
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part && typeof (part as { text: unknown }).text === "string") {
        return (part as { text: string }).text
      }
      return ""
    })
    .join("")
    .trim()
}

function skipped(model: string | null, reason: string): DigestShadowRecord {
  return { status: "skipped", model, text: null, reason }
}

function failed(model: string | null, reason: string): DigestShadowRecord {
  return { status: "failed", model, text: null, reason }
}

export async function runDigestShadow(
  facts: DigestFacts,
  env: ShadowEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<DigestShadowRecord> {
  const reason = shadowSkipReason(env)
  const model = shadowModel(env)
  if (reason) return skipped(model, reason)

  const token = shadowCredential(env)
  if (!model || !token) return skipped(model, "AI Gateway credentials are unset")

  try {
    const response = await fetchImpl("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          { role: "system", content: SHADOW_SYSTEM },
          { role: "user", content: buildDigestShadowPrompt(facts) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return failed(model, `AI Gateway returned ${response.status}`)
    }

    const text = readGatewayCompletionText(await response.json())
    if (!text) return failed(model, "AI Gateway returned an empty summary")
    return { status: "recorded", model, text, reason: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI Gateway request failed"
    return failed(model, message.slice(0, 180))
  }
}
