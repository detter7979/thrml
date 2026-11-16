/**
 * One AI Gateway chat call shared by skill shadows and, later, live cutover.
 * Model id and credentials come from the environment. Nothing here chooses
 * a model on its own.
 */

export type GatewayEnv = Record<string, string | undefined>

export type GatewayMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ModelReading = {
  status: "skipped" | "recorded" | "failed"
  model: string | null
  text: string | null
  reason: string | null
}

export function gatewayModel(env: GatewayEnv): string | null {
  return env.AGENT_SHADOW_MODEL?.trim() || env.AI_GATEWAY_MODEL?.trim() || null
}

export function gatewayCredential(env: GatewayEnv): string | null {
  return env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || null
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

function skipped(model: string | null, reason: string): ModelReading {
  return { status: "skipped", model, text: null, reason }
}

function failed(model: string | null, reason: string): ModelReading {
  return { status: "failed", model, text: null, reason }
}

export async function completeGatewayChat(opts: {
  messages: GatewayMessage[]
  maxTokens: number
  env?: GatewayEnv
  fetchImpl?: typeof fetch
}): Promise<ModelReading> {
  const env = opts.env ?? process.env
  const model = gatewayModel(env)
  const token = gatewayCredential(env)
  if (!model) return skipped(null, "AGENT_SHADOW_MODEL is unset")
  if (!token) return skipped(model, "AI Gateway credentials are unset")

  try {
    const response = await (opts.fetchImpl ?? fetch)("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        messages: opts.messages,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) return failed(model, `AI Gateway returned ${response.status}`)
    const text = readGatewayCompletionText(await response.json())
    if (!text) return failed(model, "AI Gateway returned an empty summary")
    return { status: "recorded", model, text, reason: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI Gateway request failed"
    return failed(model, message.slice(0, 180))
  }
}
