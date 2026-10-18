import { requireAdmin } from "@/lib/admin-guard"
import { loadCreativeLibrary } from "@/lib/creative/library"

import { CreativeLibraryClient } from "./creative-library-client"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export default async function CreativeLibraryPage() {
  const { admin } = await requireAdmin()
  let items: Awaited<ReturnType<typeof loadCreativeLibrary>> = []
  let error: string | null = null
  try {
    items = await loadCreativeLibrary(admin)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const needsReorganize = items.some((i) => /^\d{4}\/\d{2}\//.test((i.gcsPath ?? "").replace(/^gs:\/\/[^/]+\//, "")))

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl text-[#2A2118]">Paid media · Creative</h1>
        <p className="mt-1 text-sm text-[#6E5B49]">
          Every creative the pipeline has made, filed by year → persona → angle and named after its ad. Filter by any tag;
          set theme (and fix anything wrong) on the card.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      <CreativeLibraryClient items={items} needsReorganize={needsReorganize} />
    </div>
  )
}
