import { getServiceTypes } from "@/lib/supabase/queries"

import { ExploreClient } from "./explore-client"

export default async function ExplorePage() {
  const serviceTypes = await getServiceTypes()
  return <ExploreClient serviceTypes={serviceTypes} />
}
