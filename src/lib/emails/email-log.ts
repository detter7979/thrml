import { createAdminClient } from "@/lib/supabase/admin"

export async function emailAlreadySent(
  userId: string,
  emailType: string,
  referenceId: string = userId
): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("email_log")
    .select("id")
    .eq("user_id", userId)
    .eq("email_type", emailType)
    .eq("reference_id", referenceId)
    .maybeSingle()
  return Boolean(data)
}

export async function logEmailSent(
  userId: string,
  emailType: string,
  referenceId: string = userId
): Promise<void> {
  const admin = createAdminClient()
  await admin.from("email_log").upsert(
    { user_id: userId, email_type: emailType, reference_id: referenceId },
    { onConflict: "user_id,email_type,reference_id" }
  )
}
