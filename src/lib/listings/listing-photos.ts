export type ListingPhotoRef = {
  url?: string | null
  order_index?: number | null
}

/** First cover photo by `order_index` (matches detail pages and SEO cards). */
export function pickPrimaryListingPhotoUrl(
  photos: ListingPhotoRef[] | null | undefined
): string | null {
  if (!photos?.length) return null
  const sorted = [...photos].sort(
    (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
  )
  const url = sorted[0]?.url
  return typeof url === "string" && url.trim() ? url.trim() : null
}
