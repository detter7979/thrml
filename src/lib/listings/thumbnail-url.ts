/**
 * Supabase Storage image transformations (smaller payloads for cards).
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * Requires the project to have Storage image transformations available.
 * Signed URLs (`/object/sign/`) are returned unchanged.
 */
const DEFAULT_CARD_WIDTH = 640
const DEFAULT_QUALITY = 76

export function listingPhotoThumbnailUrl(
  rawUrl: string | null | undefined,
  options?: { width?: number; quality?: number }
): string | null {
  if (typeof rawUrl !== "string") return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  if (!trimmed.includes(".supabase.co/storage/v1/")) return trimmed
  if (trimmed.includes("/storage/v1/render/image/")) return trimmed
  if (trimmed.includes("/storage/v1/object/sign/")) return trimmed

  const objectPublic = "/storage/v1/object/public/"
  if (!trimmed.includes(objectPublic)) return trimmed

  const width = options?.width ?? DEFAULT_CARD_WIDTH
  const quality = options?.quality ?? DEFAULT_QUALITY

  const [base] = trimmed.split("?", 1)
  const renderBase = base.replace(objectPublic, "/storage/v1/render/image/public/")
  const params = new URLSearchParams()
  params.set("width", String(width))
  params.set("quality", String(quality))
  return `${renderBase}?${params.toString()}`
}
