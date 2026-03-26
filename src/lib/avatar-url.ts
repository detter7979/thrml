/** True if the string looks like a usable avatar URL (avoids broken <img src="">). */
export function isLikelyValidAvatarUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return false
  if (u.startsWith("data:image/")) return true
  if (u.startsWith("/")) return true
  try {
    const parsed = new URL(u)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}
