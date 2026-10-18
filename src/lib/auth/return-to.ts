/**
 * Remembers where a guest was (e.g. midway through a booking) before they were sent to sign in.
 *
 * The `next` query param on our auth redirect URLs is the primary carrier, but Supabase drops the
 * whole redirect URL (and falls back to the Site URL, i.e. the home page) when it doesn't match the
 * Auth → Redirect URLs allowlist. This first-party cookie survives that, so /auth/callback can still
 * send the person back to the right step.
 */
import { sanitizeNextPath } from "@/lib/sanitize-next-path"

export const RETURN_TO_COOKIE = "thrml_return_to"
const MAX_AGE_SECONDS = 30 * 60

export function rememberReturnTo(path: string | null | undefined) {
  if (typeof document === "undefined") return
  const safe = sanitizeNextPath(path ?? null, null)
  if (!safe || safe === "/") {
    document.cookie = `${RETURN_TO_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    return
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${RETURN_TO_COOKIE}=${encodeURIComponent(safe)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function readReturnToCookie(raw: string | undefined | null): string | null {
  if (!raw) return null
  try {
    return sanitizeNextPath(decodeURIComponent(raw), null)
  } catch {
    return null
  }
}
