/**
 * Supabase Storage image transformations (smaller payloads for cards).
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * Requires the project to have Storage image transformations available.
 * Signed URLs (`/object/sign/`) are returned unchanged.
 */
const DEFAULT_CARD_WIDTH = 640
const DEFAULT_QUALITY = 76

/** Card cover frame is 4:3 — wider than 16:9 so portrait/square uploads crop less aggressively. */
export const LISTING_CARD_COVER_WIDTH = 720
export const LISTING_CARD_COVER_ASPECT = 4 / 3

export type ListingPhotoThumbnailOptions = {
  width?: number
  height?: number
  quality?: number
  /** Crop to exact dimensions (email cards). Defaults to width-only scaling when omitted. */
  resize?: "cover" | "contain" | "fill"
}

export function listingPhotoThumbnailUrl(
  rawUrl: string | null | undefined,
  options?: ListingPhotoThumbnailOptions
): string | null {
  if (typeof rawUrl !== "string") return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  if (!trimmed.includes(".supabase.co/storage/v1/")) return trimmed
  if (trimmed.includes("/storage/v1/object/sign/")) return trimmed

  const objectPublic = "/storage/v1/object/public/"
  const renderPrefix = "/storage/v1/render/image/public/"

  const width = options?.width ?? DEFAULT_CARD_WIDTH
  const quality = options?.quality ?? DEFAULT_QUALITY

  const [base, query = ""] = trimmed.split("?", 2)
  const renderBase = base.includes(renderPrefix)
    ? base
    : base.includes(objectPublic)
      ? base.replace(objectPublic, renderPrefix)
      : null

  if (!renderBase) return trimmed

  const params = new URLSearchParams(query)
  params.set("width", String(width))
  params.set("quality", String(quality))
  if (typeof options?.height === "number" && options.height > 0) {
    params.set("height", String(options.height))
  } else {
    params.delete("height")
  }
  if (options?.resize) {
    params.set("resize", options.resize)
  } else {
    params.delete("resize")
  }
  return `${renderBase}?${params.toString()}`
}

/** Width-only Supabase transform for grid cards — preserves source aspect ratio (no server-side crop). */
export function listingCardCoverUrl(rawUrl: string | null | undefined): string | null {
  return listingPhotoThumbnailUrl(rawUrl, {
    width: LISTING_CARD_COVER_WIDTH,
    quality: DEFAULT_QUALITY,
  })
}
