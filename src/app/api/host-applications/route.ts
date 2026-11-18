import { after, NextRequest, NextResponse } from "next/server"

import { sendAdminNewApplicationEmail, sendHostApplicationReceivedEmail } from "@/lib/emails/host-applications"
import {
  applicationRow,
  hostApplicationSchema,
  type ApplicationStatus,
} from "@/lib/host/host-applications"
import { rateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** POST /api/host-applications — founding-host application or future-host lead. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 10 * 60 * 1000, identifier: "host-application" })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = hostApplicationSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? "Please check the form and try again." }, { status: 400 })
  }
  const input = parsed.data

  // Honeypot: pretend success so bots don't retry.
  if (input.website && input.website.trim()) {
    return NextResponse.json({ ok: true, owner: input.owns_sauna === "yes" })
  }

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    userId = null
  }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from("host_applications")
    .select("status")
    .eq("email", input.email)
    .maybeSingle()
  if (readError) {
    console.error("[host-applications] read failed", readError.message)
    return NextResponse.json({ error: "Couldn't save your application. Please try again." }, { status: 500 })
  }

  const row = applicationRow(input, (existing?.status as ApplicationStatus | undefined) ?? null, userId)
  const { error: writeError } = await admin.from("host_applications").upsert(row, { onConflict: "email" })
  if (writeError) {
    console.error("[host-applications] upsert failed", writeError.message)
    return NextResponse.json({ error: "Couldn't save your application. Please try again." }, { status: 500 })
  }

  // Emails after the response; failures are logged, not shown to the applicant.
  after(async () => {
    const results = await Promise.allSettled([
      existing ? Promise.resolve(null) : sendHostApplicationReceivedEmail(input),
      sendAdminNewApplicationEmail(input),
    ])
    for (const r of results) {
      if (r.status === "rejected") console.error("[host-applications] email failed", r.reason)
    }
  })

  return NextResponse.json({ ok: true, owner: input.owns_sauna === "yes" })
}
