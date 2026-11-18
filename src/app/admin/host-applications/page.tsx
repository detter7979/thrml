import { requireAdmin } from "@/lib/admin-guard"
import { fetchFoundingHostSettings, foundingSpotsRemaining } from "@/lib/host/founding-host"

import { HostApplicationsClient, type HostApplicationRow } from "./host-applications-client"

export const dynamic = "force-dynamic"

export default async function AdminHostApplicationsPage() {
  const { admin } = await requireAdmin()

  const [{ data }, settings] = await Promise.all([
    admin
      .from("host_applications")
      .select(
        "id, created_at, email, full_name, phone, owns_sauna, neighborhood, sauna_type, private_access, availability, notes, status, admin_note, utm_source, utm_campaign, user_id"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    fetchFoundingHostSettings(admin),
  ])
  const spotsLeft = await foundingSpotsRemaining(admin, settings.cap)

  return (
    <HostApplicationsClient
      rows={(data ?? []) as HostApplicationRow[]}
      foundingCap={settings.cap}
      foundingSpotsLeft={spotsLeft}
    />
  )
}
