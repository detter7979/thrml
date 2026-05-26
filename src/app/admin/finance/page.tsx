import { requireAdmin } from "@/lib/admin-guard"

import { AdminFinanceClient } from "./finance-client"

export const dynamic = "force-dynamic"

export default async function AdminFinancePage() {
  await requireAdmin()
  return <AdminFinanceClient />
}
