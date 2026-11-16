import type { FeedListing } from "@/lib/feeds/get-listings-for-feed"
import { getServiceLabel } from "@/lib/feeds/get-listings-for-feed"
import { googleFeedItemId } from "@/lib/feeds/google-feed-id"

/**
 * Google Ads "custom" business data feed (DYNAMIC_CUSTOM assets) for dynamic remarketing.
 * Non-retail businesses use this instead of Merchant Center. One item per live listing.
 * Location is city-level only: exact addresses stay private until a guest books.
 */

export type CustomFeedItem = {
  id: string
  itemTitle: string
  itemSubtitle: string
  itemDescription: string
  itemAddress: string
  itemCategory: string
  price: string
  formattedPrice: string
  imageUrl: string
  finalUrl: string
}

/** Fields compared to decide whether an existing asset needs an update (id never changes). */
export const CUSTOM_FEED_COMPARED_FIELDS = [
  "itemTitle",
  "itemSubtitle",
  "itemDescription",
  "itemAddress",
  "itemCategory",
  "price",
  "formattedPrice",
  "imageUrl",
  "finalUrl",
] as const satisfies readonly (keyof CustomFeedItem)[]

/** Google recommends ~25 characters for titles and subtitles in dynamic ads; cut at a word. */
export function clipText(value: string, max = 25): string {
  const t = value.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max + 1)
  const atSpace = cut.lastIndexOf(" ")
  let out = atSpace >= Math.floor(max * 0.6) ? cut.slice(0, atSpace) : t.slice(0, max)
  // Don't end on a dangling connector ("Cedar barrel sauna in").
  const words = out.split(" ")
  while (words.length > 1 && TRAILING_FILLER.has(words[words.length - 1].toLowerCase())) words.pop()
  out = words.join(" ")
  return out.replace(/[\s,.;:–—&-]+$/, "")
}

const TRAILING_FILLER = new Set(["in", "at", "on", "by", "with", "and", "the", "of", "a", "an", "&", "near", "for", "to"])

export function buildCustomFeedItem(listing: FeedListing): CustomFeedItem | null {
  if (!listing.id || !listing.image_url || !listing.url) return null
  const label = getServiceLabel(listing.service_type)
  const fixed = listing.session_type === "fixed_session"
  const city = [listing.location_city, listing.location_state].filter(Boolean).join(", ")
  const hasPrice = Number.isFinite(listing.price) && listing.price > 0
  const dollars = hasPrice ? (Number.isInteger(listing.price) ? `$${listing.price}` : `$${listing.price.toFixed(2)}`) : ""
  return {
    id: googleFeedItemId(listing.id),
    itemTitle: clipText(listing.title || `Private ${label.toLowerCase()}`),
    itemSubtitle: clipText(city || "Seattle, WA"),
    itemDescription: clipText(fixed ? `Private ${label.toLowerCase()} session` : `Private ${label.toLowerCase()} by the hour`),
    itemAddress: city ? `${city}, USA` : "",
    itemCategory: label,
    price: hasPrice ? `${listing.price.toFixed(2)} USD` : "",
    formattedPrice: hasPrice ? `${dollars}/${fixed ? "session" : "hour"}` : "",
    imageUrl: listing.image_url,
    finalUrl: listing.url,
  }
}

export type ExistingFeedAsset = {
  assetSetAssetResourceName: string
  assetResourceName: string
  item: CustomFeedItem
}

export type CustomFeedDiff = {
  create: CustomFeedItem[]
  update: { assetResourceName: string; item: CustomFeedItem; changed: string[] }[]
  remove: ExistingFeedAsset[]
  unchanged: number
}

/** What to create, update and unlink so the feed matches the live listings. */
export function diffCustomFeed(desired: CustomFeedItem[], existing: ExistingFeedAsset[]): CustomFeedDiff {
  const byId = new Map<string, ExistingFeedAsset>()
  const duplicates: ExistingFeedAsset[] = []
  for (const e of existing) {
    if (byId.has(e.item.id)) duplicates.push(e)
    else byId.set(e.item.id, e)
  }
  const out: CustomFeedDiff = { create: [], update: [], remove: [...duplicates], unchanged: 0 }
  const wanted = new Set<string>()
  for (const item of desired) {
    if (wanted.has(item.id)) continue
    wanted.add(item.id)
    const current = byId.get(item.id)
    if (!current) {
      out.create.push(item)
      continue
    }
    const changed = CUSTOM_FEED_COMPARED_FIELDS.filter((f) => (current.item[f] ?? "") !== (item[f] ?? ""))
    if (changed.length) out.update.push({ assetResourceName: current.assetResourceName, item, changed })
    else out.unchanged++
  }
  for (const [id, e] of byId) if (!wanted.has(id)) out.remove.push(e)
  return out
}

/** REST body for `dynamicCustomAsset` (empty optional fields left out). */
export function toDynamicCustomAsset(item: CustomFeedItem, opts: { includeId: boolean }): Record<string, string> {
  const body: Record<string, string> = {}
  if (opts.includeId) body.id = item.id
  body.itemTitle = item.itemTitle
  for (const key of ["itemSubtitle", "itemDescription", "itemAddress", "itemCategory", "price", "formattedPrice", "imageUrl"] as const) {
    if (item[key]) body[key] = item[key]
  }
  return body
}

/** updateMask paths for a changed item (REST JSON uses camelCase paths). */
export function updateMaskFor(changed: readonly string[]): string {
  return changed.map((f) => (f === "finalUrl" ? "finalUrls" : `dynamicCustomAsset.${f}`)).join(",")
}
