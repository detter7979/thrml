import type { MetadataRoute } from "next"

import { createClient } from "@/lib/supabase/server"
import {
  citySlugToDisplayName,
  fetchListingsForLocalLanding,
  resolveServiceFromSlug,
  SERVICE_CANONICAL_SLUG,
} from "@/lib/seo/local-service-landing"

const LANDING_PAGES = [
  { service: SERVICE_CANONICAL_SLUG.sauna, city: "seattle" },
  { service: SERVICE_CANONICAL_SLUG.cold_plunge, city: "seattle" },
  { service: SERVICE_CANONICAL_SLUG.float_tank, city: "seattle" },
]

/**
 * City landing pages are noindex until they have listings ([service]/[city]/page.tsx), so only
 * list the ones with listings; submitting noindex URLs is a Search Console error.
 */
async function indexableLandingUrls(): Promise<MetadataRoute.Sitemap> {
  const results = await Promise.all(
    LANDING_PAGES.map(async ({ service, city }) => {
      const resolved = resolveServiceFromSlug(service)
      if (!resolved) return null
      try {
        const rows = await fetchListingsForLocalLanding(resolved.serviceType, citySlugToDisplayName(city), city)
        if (rows.length === 0) return null
      } catch {
        return null
      }
      return {
        url: `https://usethrml.com/${resolved.canonicalSlug}/${city}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.85,
      }
    })
  )
  return results.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const { data: listings } = await supabase
    .from("listings")
    .select("id, updated_at")
    .eq("is_active", true)
    .eq("is_draft", false)

  const listingUrls = (listings || []).map((listing) => ({
    url: `https://usethrml.com/listings/${listing.id}`,
    lastModified: new Date(listing.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [
    {
      url: "https://usethrml.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: "https://usethrml.com/explore",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://usethrml.com/become-a-host",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://usethrml.com/our-story",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://usethrml.com/faq",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: "https://usethrml.com/support",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    ...(await indexableLandingUrls()),
    ...listingUrls,
  ]
}
