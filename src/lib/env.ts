/**
 * Read an env var, trimming whitespace and one pair of wrapping quotes.
 * Values pasted into the Vercel dashboard with quotes ("abc") are stored
 * literally, which silently breaks API calls that use them.
 */
export function envClean(name: string): string | undefined {
  const raw = process.env[name]
  if (raw == null) return undefined
  const trimmed = raw.trim()
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1).trim()
      : trimmed
  return unquoted || undefined
}
