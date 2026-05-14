import { redirect } from "next/navigation"

import { requireAdmin } from "@/lib/admin-guard"

export const dynamic = "force-dynamic"

export default async function AdminDisputesPage() {
  await requireAdmin()
  redirect("/admin/inbox/disputes")
}
