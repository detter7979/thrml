import { redirect } from "next/navigation"

import { HostProfileContent } from "@/components/profile/HostProfileContent"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ reviews?: string }>
}) {
  const query = await searchParams
  const visibleReviews = Math.max(10, Number.parseInt(query.reviews ?? "10", 10) || 10)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/dashboard/profile")

  return <HostProfileContent hostId={user.id} visibleReviews={visibleReviews} />
}
