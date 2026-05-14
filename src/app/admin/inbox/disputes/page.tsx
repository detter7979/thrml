import { requireAdmin } from "@/lib/admin-guard"

import { DisputesDashboardClient } from "@/app/admin/disputes/disputes-client"
import { loadDisputesDashboardData } from "@/app/admin/disputes/load-disputes-dashboard-data"

export const dynamic = "force-dynamic"

export default async function AdminInboxDisputesPage() {
  const { admin } = await requireAdmin()
  const { ticketsWithDecisions, stats, policy } = await loadDisputesDashboardData(admin)

  return (
    <DisputesDashboardClient initialTickets={ticketsWithDecisions} stats={stats} policy={policy} />
  )
}
