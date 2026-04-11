import Anthropic from "@anthropic-ai/sdk"
import fs from "fs"
import path from "path"

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
  /** Max tokens (default 1000) */
  maxTokens?: number
  /** Prior messages for multi-turn (optional) */
  history?: AgentMessage[]
}

export type AgentCallResult = {
  text: string
  inputTokens: number
  outputTokens: number
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
      model: "claude-sonnet-4-20250514",
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
    }
  } catch (err) {
    console.error(`[agent/claude] callAgent failed for skill=${opts.skill}`, err)
    return {
      text: "",
      inputTokens: 0,
      outputTokens: 0,
    }
  }
}

/**
 * Call Claude expecting a JSON response. Strips markdown fences.
 * Returns parsed object or null on failure.
 */
export async function callAgentJson<T>(opts: AgentCallOptions): Promise<T | null> {
  const result = await callAgent({ ...opts, prompt: opts.prompt + "\n\nRespond with valid JSON only. No markdown, no preamble." })
  if (!result.text) return null
  try {
    return JSON.parse(result.text.replace(/```json|```/g, "").trim()) as T
  } catch {
    console.error(`[agent/claude] JSON parse failed for skill=${opts.skill}`, result.text.slice(0, 200))
    return null
  }
}
