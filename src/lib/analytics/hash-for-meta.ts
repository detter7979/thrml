import crypto from "crypto"

export function normalizeForHash(value: string) {
  return value.trim().toLowerCase()
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

/** Hash email for Meta CAPI user_data.em, or pass through if already hex. */
export function hashIfPresent(value?: string) {
  if (!value) return undefined
  const normalized = normalizeForHash(value)
  if (!normalized) return undefined
  return /^[a-f0-9]{64}$/i.test(normalized) ? normalized : sha256(normalized)
}
