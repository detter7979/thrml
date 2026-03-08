import { redirect } from "next/navigation"

type SearchParams = {
  stripe?: string
}

export default async function LegacyHostEarningsRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  const suffix = query.stripe ? `?stripe=${encodeURIComponent(query.stripe)}` : ""
  redirect(`/dashboard/earnings${suffix}`)
}
