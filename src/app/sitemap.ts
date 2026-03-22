import type { MetadataRoute } from "next"

import { createClient } from "@/lib/supabase/server"

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
    {
      url: "https://usethrml.com/saunas/seattle",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: "https://usethrml.com/cold-plunge/seattle",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: "https://usethrml.com/float-tank/seattle",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    ...listingUrls,
  ]
}
