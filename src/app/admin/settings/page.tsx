import { requireAdmin } from "@/lib/admin-guard"

import { AdminSettingsClient } from "./settings-client"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  await requireAdmin()
  return <AdminSettingsClient />
}
