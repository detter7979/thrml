import { HostProfileContent } from "@/components/profile/HostProfileContent"

export default async function HostPublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reviews?: string; from?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const visibleReviews = Math.max(10, Number.parseInt(query.reviews ?? "10", 10) || 10)
  const backToListingPath =
    typeof query.from === "string" &&
    (query.from.startsWith("/listing/") || query.from.startsWith("/listings/"))
      ? query.from
      : null

  return <HostProfileContent hostId={id} visibleReviews={visibleReviews} backToListingPath={backToListingPath} />
}
