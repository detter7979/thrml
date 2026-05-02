export function loadGoogleServiceAccountCredentials(): Record<string, string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")

  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, string>
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is malformed: ${message}`)
    }
  }
}
