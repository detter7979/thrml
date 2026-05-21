import type { SupabaseClient } from "@supabase/supabase-js"

import type { FinancialEventType } from "@/lib/finance/types"

type AdminClient = SupabaseClient

export type RecordFinancialEventInput = {
  eventType: FinancialEventType
  /** Signed cents: + platform inflow, − outflow/expense */
  amountCents: number
  bookingId?: string | null
  userId?: string | null
  stripeEventId?: string | null
  stripeObjectId?: string | null
  source: string
  metadata?: Record<string, unknown>
  occurredAt?: string
}

export async function recordFinancialEvent(
  admin: AdminClient,
  input: RecordFinancialEventInput
): Promise<{ ok: true; id: string } | { ok: false; error: string; duplicate?: boolean }> {
  const row = {
    event_type: input.eventType,
    amount_cents: Math.round(input.amountCents),
    booking_id: input.bookingId ?? null,
    user_id: input.userId ?? null,
    stripe_event_id: input.stripeEventId ?? null,
    stripe_object_id: input.stripeObjectId ?? null,
    source: input.source,
    metadata: input.metadata ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  }

  const { data, error } = await admin
    .from("financial_events")
    .insert(row)
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: error.message, duplicate: true }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, id: String(data.id) }
}
