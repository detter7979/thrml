import { NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"

type SupportTicketRow = {
  id: string
  ticket_number?: string | null
  subject?: string | null
  message?: string | null
  priority?: string | null
  status?: string | null
  name?: string | null
  email?: string | null
  booking_id?: string | null
  user_id?: string | null
  created_at?: string | null
  inserted_at?: string | null
}

function isMissingColumnError(message: string) {
  const normalized = message.toLowerCase()
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    (normalized.includes("could not find") &&
      normalized.includes("column") &&
      normalized.includes("schema cache"))
  )
}

export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const attempts = [
    () =>
      admin
        .from("support_requests")
        .select("id, ticket_number, subject, message, priority, status, name, email, booking_id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    () =>
      admin
        .from("support_requests")
        .select("id, ticket_number, subject, message, priority, name, email, booking_id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    () =>
      admin
        .from("support_requests")
        .select("id, subject, message, name, email, booking_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    () =>
      admin
        .from("support_requests")
        .select("id, ticket_number, subject, message, priority, status, name, email, booking_id, user_id")
        .order("id", { ascending: false })
        .limit(200),
    () =>
      admin
        .from("support_requests")
        .select("id, subject, message, name, email, booking_id")
        .order("id", { ascending: false })
        .limit(200),
  ] as const

  let rows: SupportTicketRow[] | null = null
  let queryError: { message: string } | null = null
  for (const attempt of attempts) {
    const result = await attempt()
    if (!result.error) {
      rows = (result.data ?? []) as SupportTicketRow[]
      queryError = null
      break
    }
    queryError = result.error
    if (!isMissingColumnError(result.error.message)) break
  }

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const tickets = (rows ?? []).map((row) => ({
    id: row.id,
    ticket_number: row.ticket_number ?? null,
    subject: row.subject ?? null,
    message: row.message ?? null,
    priority: row.priority ?? "normal",
    status: row.status ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    booking_id: row.booking_id ?? null,
    user_id: row.user_id ?? null,
    created_at: row.created_at ?? row.inserted_at ?? null,
  }))

  return NextResponse.json({ tickets })
}
