import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { DeleteAccountClient } from "./delete-account-client"

export const metadata: Metadata = {
  title: "Delete Account",
  robots: { index: false, follow: false },
}

export default async function DeleteAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_requested_at")
    .eq("id", user!.id)
    .maybeSingle()

  return (
    <DeleteAccountClient
      deletionRequestedAt={
        typeof profile?.deletion_requested_at === "string" ? profile.deletion_requested_at : null
      }
      userEmail={user!.email ?? ""}
    />
  )
}
