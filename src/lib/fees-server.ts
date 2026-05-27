import { unstable_cache, revalidateTag } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

import { fetchPlatformFeePercents, type PlatformFeePercents } from "@/lib/fees"

/** Bust cached platform fee reads after admin fee updates. */
export function invalidatePlatformFeePercentsCache() {
  revalidateTag("platform-fees", "max")
}

const loadPlatformFeePercents = unstable_cache(
  async () => fetchPlatformFeePercents(createAdminClient()),
  ["platform-fee-percents"],
  { revalidate: 3600, tags: ["platform-fees"] }
)

export async function getPlatformFeePercentsCached(): Promise<PlatformFeePercents> {
  return loadPlatformFeePercents()
}
