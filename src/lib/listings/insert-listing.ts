import type { SupabaseClient } from "@supabase/supabase-js"

export const REQUIRED_LISTING_COLUMNS = new Set([
  "title",
  "service_type",
  "lat",
  "lng",
  "availability",
  "price_solo",
])

export async function insertListingWithColumnFallback(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  options?: { maxAttempts?: number }
): Promise<{ data: { id: string } | null; error: string | null; code: string | null }> {
  const listingPayload = { ...payload }
  const maxAttempts = options?.maxAttempts ?? 6

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from("listings")
      .insert(listingPayload)
      .select("id")
      .single()

    if (!error && data && typeof data.id === "string") {
      return { data: { id: data.id }, error: null, code: null }
    }

    const message = error?.message ?? "Failed to create listing."
    const code = typeof error?.code === "string" ? error.code : null
    const missingColumnMatch =
      message.match(/'([^']+)' column of 'listings'/i) ?? message.match(/'([^']+)' column/i)
    const missingColumn = missingColumnMatch?.[1]

    if (!missingColumn || !(missingColumn in listingPayload)) {
      return { data: null, error: message, code }
    }

    if (REQUIRED_LISTING_COLUMNS.has(missingColumn)) {
      return {
        data: null,
        error: `Database schema is missing required column "${missingColumn}". Run the latest listings migration before publishing.`,
        code,
      }
    }

    delete listingPayload[missingColumn]
  }

  return { data: null, error: "Failed to create listing.", code: null }
}
