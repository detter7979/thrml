/**
 * Default Claude model for every server-side call.
 * Override with ANTHROPIC_MODEL in Vercel when a model is retired,
 * so a deprecation doesn't require a code change.
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5"
