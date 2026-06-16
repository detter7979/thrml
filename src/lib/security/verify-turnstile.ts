// lib/security/verify-turnstile.ts
import "server-only"; // hard guard: never let this into a client/edge bundle

/**
 * Verifies a Cloudflare Turnstile token server-side. Call this in the server
 * action / route handler that inserts a support request, BEFORE the insert.
 * Never trust the client's word that it passed — always verify here.
 */
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not set");

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return data.success === true;
  } catch {
    // Fail CLOSED — a spam gate that fails open is no gate. Flip to `return true`
    // only if you'd rather risk spam than block support during a Cloudflare outage.
    return false;
  }
}
