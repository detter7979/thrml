/**
 * Item ID used for a listing in the Google Ads custom feed and in the Google tag's `items[].id`.
 * Google's custom feed IDs must be letters and digits, so the listing UUID loses its hyphens.
 * Both sides must use this function or dynamic remarketing can't match visits to feed items.
 */
export function googleFeedItemId(listingId: string): string {
  return listingId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
}
