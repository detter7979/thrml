import Anthropic from "@anthropic-ai/sdk"
import fs from "fs"
import path from "path"

import { CLAUDE_MODEL } from "./model"

const client = new Anthropic()

// Cache skill file content so we don't re-read on every request in the same process
const skillCache = new Map<string, string>()

function loadSkillFile(name: string): string {
  if (skillCache.has(name)) return skillCache.get(name)!
  try {
    const agentsDir = path.join(process.cwd(), "agents")
    const osContent = fs.readFileSync(path.join(agentsDir, "AGENT-OS.md"), "utf-8")
    const skillContent = name !== "AGENT-OS"
      ? fs.readFileSync(path.join(agentsDir, `${name}.md`), "utf-8")
      : ""
    const combined = skillContent ? `${osContent}\n\n---\n\n${skillContent}` : osContent
    skillCache.set(name, combined)
    return combined
  } catch {
    return `You are an autonomous agent for thrml (usethrml.com), a peer-to-peer wellness marketplace.`
  }
}

export type AgentMessage = {
  role: "user" | "assistant"
  content: string
}

export type AgentCallOptions = {
  /** Skill file name without extension (e.g. "finance", "social", "ops") */
  skill: string
  /** The task prompt to send */
  prompt: string
  /** Claude model override (default: CLAUDE_MODEL) */
  model?: string
  /** Max tokens (default 1000) */
  maxTokens?: number
  /** Prior messages for multi-turn (optional) */
  history?: AgentMessage[]
}

export type AgentCallResult = {
  text: string
  inputTokens: number
  outputTokens: number
  stopReason?: string
  /** Set when the API call itself failed (bad key, no credit, retired model, overload…). */
  error?: string
}

/**
 * Call Claude with a skill file as system prompt.
 * Always returns — never throws. On error returns a fallback text.
 */
export async function callAgent(opts: AgentCallOptions): Promise<AgentCallResult> {
  const systemPrompt = loadSkillFile(opts.skill)
  const messages: Anthropic.MessageParam[] = [
    ...(opts.history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: opts.prompt },
  ]

  try {
    const response = await client.messages.create({
      model: opts.model ?? CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 1000,
      system: systemPrompt,
      messages,
    })

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason ?? undefined,
    }
  } catch (err) {
    console.error(`[agent/claude] callAgent failed for skill=${opts.skill}`, err)
    const status = (err as { status?: number })?.status
    const message = err instanceof Error ? err.message : String(err)
    return {
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      error: `Claude API error${status ? ` ${status}` : ""}: ${message.slice(0, 200)}`,
    }
  }
}

/**
 * Call Claude expecting a JSON response. Strips markdown fences.
 * Returns parsed object or null on failure.
 */
export async function callAgentJson<T>(opts: AgentCallOptions): Promise<T | null> {
  return (await callAgentJsonResult<T>(opts)).data
}

/** Like callAgentJson, but also says why it failed so callers can record it in agent_runs. */
export async function callAgentJsonResult<T>(
  opts: AgentCallOptions
): Promise<{ data: T | null; error?: string }> {
  const result = await callAgent({ ...opts, prompt: opts.prompt + "\n\nRespond with valid JSON only. No markdown, no preamble." })
  if (!result.text) return { data: null, error: result.error ?? `Claude returned an empty reply (stop: ${result.stopReason ?? "unknown"})` }
  const cleaned = result.text.replace(/```json|```/g, "").trim()
  // Tolerate stray text around the JSON by taking the outermost object/array.
  const start = cleaned.search(/[[{]/)
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"))
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  try {
    return { data: JSON.parse(candidate) as T }
  } catch {
    const hint = result.stopReason === "max_tokens" ? " (hit maxTokens; raise it for this skill)" : ""
    console.error(`[agent/claude] JSON parse failed for skill=${opts.skill}${hint}`, result.text.slice(0, 200))
    return { data: null, error: `Reply wasn't valid JSON${hint}: ${result.text.slice(0, 120)}` }
  }
}
