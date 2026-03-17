export function sanitizeNextPath<T extends string | null>(
  raw: string | null | undefined,
  fallback: T = "/" as T
) {
  if (!raw) return fallback
  const candidate = raw.trim()
  if (!candidate.startsWith("/")) return fallback
  if (candidate.startsWith("//")) return fallback
  if (candidate.includes("\\")) return fallback
  return candidate
}
