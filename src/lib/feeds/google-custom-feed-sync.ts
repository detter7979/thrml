import type { SupabaseClient } from "@supabase/supabase-js"

import { googleAdsMutate, googleAdsSearch } from "@/lib/agent/google-ads-api"
import { getListingsForFeed } from "@/lib/feeds/get-listings-for-feed"
import {
  buildCustomFeedItem,
  diffCustomFeed,
  toDynamicCustomAsset,
  updateMaskFor,
  type CustomFeedItem,
  type ExistingFeedAsset,
} from "@/lib/feeds/google-custom-feed"

/** Name of the asset set in Google Ads (Tools → Shared library → Business data). */
export const GOOGLE_LISTING_FEED_NAME = "thrml listings (custom feed)"

export type GoogleFeedSyncResult = {
  assetSet: string
  createdAssetSet: boolean
  listings: number
  skipped: number
  created: number
  updated: number
  removed: number
  unchanged: number
  dryRun: boolean
  errors: string[]
}

type Row = Record<string, Record<string, unknown> | undefined>

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

async function findOrCreateAssetSet(dryRun: boolean): Promise<{ resourceName: string; created: boolean }> {
  const rows = (await googleAdsSearch(
    `SELECT asset_set.resource_name, asset_set.name FROM asset_set WHERE asset_set.type = 'DYNAMIC_CUSTOM' AND asset_set.status = 'ENABLED'`
  )) as Row[]
  const match = rows.find((r) => str(r.assetSet?.name) === GOOGLE_LISTING_FEED_NAME)
  if (match) return { resourceName: str(match.assetSet?.resourceName), created: false }
  if (dryRun) return { resourceName: "(would create)", created: true }
  const res = await googleAdsMutate("assetSets", [{ create: { name: GOOGLE_LISTING_FEED_NAME, type: "DYNAMIC_CUSTOM" } }])
  const resourceName = res.results[0]?.resourceName
  if (!resourceName) throw new Error("Google Ads did not return the new asset set")
  return { resourceName, created: true }
}

async function readExisting(assetSet: string): Promise<ExistingFeedAsset[]> {
  const rows = (await googleAdsSearch(
    `SELECT asset_set_asset.resource_name, asset.resource_name, asset.final_urls,
            asset.dynamic_custom_asset.id, asset.dynamic_custom_asset.item_title,
            asset.dynamic_custom_asset.item_subtitle, asset.dynamic_custom_asset.item_description,
            asset.dynamic_custom_asset.item_address, asset.dynamic_custom_asset.item_category,
            asset.dynamic_custom_asset.price, asset.dynamic_custom_asset.formatted_price,
            asset.dynamic_custom_asset.image_url
     FROM asset_set_asset
     WHERE asset_set_asset.asset_set = '${assetSet}' AND asset_set_asset.status = 'ENABLED'`
  )) as Row[]
  return rows.map((r) => {
    const d = (r.asset?.dynamicCustomAsset ?? {}) as Record<string, unknown>
    const urls = Array.isArray(r.asset?.finalUrls) ? (r.asset?.finalUrls as unknown[]) : []
    const item: CustomFeedItem = {
      id: str(d.id),
      itemTitle: str(d.itemTitle),
      itemSubtitle: str(d.itemSubtitle),
      itemDescription: str(d.itemDescription),
      itemAddress: str(d.itemAddress),
      itemCategory: str(d.itemCategory),
      price: str(d.price),
      formattedPrice: str(d.formattedPrice),
      imageUrl: str(d.imageUrl),
      finalUrl: str(urls[0]),
    }
    return {
      assetSetAssetResourceName: str(r.assetSetAsset?.resourceName),
      assetResourceName: str(r.asset?.resourceName),
      item,
    }
  })
}

/**
 * Makes the Google Ads custom feed match the live listings: creates items for new listings,
 * updates changed ones, and unlinks listings that are no longer live. Safe to run daily.
 */
export async function syncGoogleListingFeed(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean } = {}
): Promise<GoogleFeedSyncResult> {
  const dryRun = Boolean(opts.dryRun)
  const listings = await getListingsForFeed(supabase)
  const desired = listings.map(buildCustomFeedItem).filter((i): i is CustomFeedItem => i !== null)

  const { resourceName: assetSet, created: createdAssetSet } = await findOrCreateAssetSet(dryRun)
  const existing = createdAssetSet ? [] : await readExisting(assetSet)
  const diff = diffCustomFeed(desired, existing)

  const result: GoogleFeedSyncResult = {
    assetSet,
    createdAssetSet,
    listings: listings.length,
    skipped: listings.length - desired.length,
    created: diff.create.length,
    updated: diff.update.length,
    removed: diff.remove.length,
    unchanged: diff.unchanged,
    dryRun,
    errors: [],
  }
  if (dryRun) return result

  // New listings: create the assets, then link the ones that succeeded to the feed.
  if (diff.create.length) {
    const created = await googleAdsMutate(
      "assets",
      diff.create.map((item) => ({
        create: {
          name: `listing ${item.id}`,
          finalUrls: [item.finalUrl],
          dynamicCustomAsset: toDynamicCustomAsset(item, { includeId: true }),
        },
      })),
      { partialFailure: true }
    )
    if (created.partialFailureMessage) result.errors.push(`create: ${created.partialFailureMessage}`)
    const links = created.results
      .map((r) => r.resourceName)
      .filter((rn): rn is string => Boolean(rn))
      .map((asset) => ({ create: { assetSet, asset } }))
    const linked = await googleAdsMutate("assetSetAssets", links, { partialFailure: true })
    if (linked.partialFailureMessage) result.errors.push(`link: ${linked.partialFailureMessage}`)
    result.created = linked.results.filter((r) => r.resourceName).length
  }

  if (diff.update.length) {
    const updated = await googleAdsMutate(
      "assets",
      diff.update.map(({ assetResourceName, item, changed }) => ({
        update: {
          resourceName: assetResourceName,
          finalUrls: [item.finalUrl],
          dynamicCustomAsset: toDynamicCustomAsset(item, { includeId: false }),
        },
        updateMask: updateMaskFor(changed),
      })),
      { partialFailure: true }
    )
    if (updated.partialFailureMessage) result.errors.push(`update: ${updated.partialFailureMessage}`)
    result.updated = updated.results.filter((r) => r.resourceName).length
  }

  if (diff.remove.length) {
    const removed = await googleAdsMutate(
      "assetSetAssets",
      diff.remove.map((e) => ({ remove: e.assetSetAssetResourceName })),
      { partialFailure: true }
    )
    if (removed.partialFailureMessage) result.errors.push(`remove: ${removed.partialFailureMessage}`)
    result.removed = removed.results.filter((r) => r.resourceName).length
  }

  return result
}
