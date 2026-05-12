import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"

export default async function PaidMediaCampaignEditStubPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-3xl text-[#2A2118]">Edit campaign</h1>
        <p className="mt-1 font-mono text-sm text-[#6E5B49]">{id}</p>
        <p className="mt-3 text-sm text-[#6E5B49]">Editor UI is not wired yet — this route reserves the URL for the next iteration.</p>
      </div>
      <Link
        href="/admin/paid-media/campaigns"
        className="inline-block rounded-full border border-[#CDBCA8] bg-white px-3 py-1.5 text-sm text-[#2A2118] hover:bg-[#F3EADD]"
      >
        Back to campaigns
      </Link>
    </div>
  )
}
