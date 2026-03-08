import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { DashboardBookingsClient } from "./bookings-client"

export default async function DashboardBookingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  return <DashboardBookingsClient userRole="guest" />
}
