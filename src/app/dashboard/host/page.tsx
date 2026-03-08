import { redirect } from "next/navigation"

type SearchParams = {
  stripe?: string
}

export default async function HostDashboardRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  const suffix = query.stripe ? `?stripe=${encodeURIComponent(query.stripe)}` : ""
  redirect(`/dashboard/earnings${suffix}`)
}
