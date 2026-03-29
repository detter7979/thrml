import { requireAdmin } from "@/lib/admin-guard"

import { AdminReferralsClient } from "./referrals-client"

export const dynamic = "force-dynamic"

export default async function AdminReferralsPage() {
  await requireAdmin()
  return <AdminReferralsClient />
}
