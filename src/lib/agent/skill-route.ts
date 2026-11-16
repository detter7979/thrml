/**
 * Per-skill switch between the current Claude call and a Grok reading.
 *
 * AGENT_SHADOW_SKILLS records a second reading and leaves the returned text alone.
 * AGENT_LIVE_SKILLS makes that reading the text callers act on.
 * Both lists are empty unless set, so every current job stays on Claude.
 */

import { completeGatewayChat, type GatewayEnv, type GatewayMessage, type ModelReading } from "./gateway-chat"

export type SkillText = {
  text: string
  inputTokens: number
  outputTokens: number
  stopReason?: string
  error?: string
}

export type RoutedSkillText = SkillText & {
  liveSource: "claude" | "gateway"
  shadow?: ModelReading
}

const SKILL_TEAM: Record<string, string> = {
  social: "studio",
  creative: "studio",
  "email-inbox": "front-desk",
  disputes: "front-desk",
}

export function skillListed(skill: string, raw: string | undefined): boolean {
  if (!raw?.trim()) return false
  const items = raw.split(",").map((item) => item.trim()).filter(Boolean)
  return items.includes("*") || items.includes(skill)
}

function gatewayMessages(system: string, prompt: string, history: GatewayMessage[] = []): GatewayMessage[] {
  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: prompt },
  ]
}

async function persistSkillShadow(skill: string, reading: ModelReading): Promise<void> {
  if (reading.status === "skipped") return
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()
    const { error } = await admin.from("agent_runs").insert({
      agent_name: `shadow:${skill}`,
      status: reading.status === "recorded" ? "success" : "error",
      completed_at: new Date().toISOString(),
      error_message: reading.status === "failed" ? reading.reason : null,
      results: {
        team: SKILL_TEAM[skill] ?? null,
        liveSource: "claude",
        shadow: reading,
      },
    })
    if (error) console.error(`[skill-shadow] failed to record ${skill}`, error.message)
  } catch (err) {
    console.error(`[skill-shadow] failed to record ${skill}`, err)
  }
}

export async function resolveSkillText(opts: {
  skill: string
  system: string
  prompt: string
  history?: GatewayMessage[]
  maxTokens: number
  claude: () => Promise<SkillText>
  env?: GatewayEnv
  fetchImpl?: typeof fetch
  persist?: (skill: string, reading: ModelReading) => Promise<void>
}): Promise<RoutedSkillText> {
  const env = opts.env ?? process.env
  const persist = opts.persist ?? persistSkillShadow
  const messages = gatewayMessages(opts.system, opts.prompt, opts.history)

  if (skillListed(opts.skill, env.AGENT_LIVE_SKILLS)) {
    const reading = await completeGatewayChat({
      messages,
      maxTokens: opts.maxTokens,
      env,
      fetchImpl: opts.fetchImpl,
    })
    if (reading.status === "recorded" && reading.text) {
      return {
        text: reading.text,
        inputTokens: 0,
        outputTokens: 0,
        stopReason: "gateway",
        liveSource: "gateway",
      }
    }
    const fallback = await opts.claude()
    return { ...fallback, liveSource: "claude", shadow: reading }
  }

  const live = await opts.claude()
  if (!skillListed(opts.skill, env.AGENT_SHADOW_SKILLS)) {
    return { ...live, liveSource: "claude" }
  }

  const shadow = await completeGatewayChat({
    messages,
    maxTokens: opts.maxTokens,
    env,
    fetchImpl: opts.fetchImpl,
  })
  try {
    await persist(opts.skill, shadow)
  } catch (err) {
    console.error(`[skill-shadow] persist failed for ${opts.skill}`, err)
  }
  return { ...live, liveSource: "claude", shadow }
}
