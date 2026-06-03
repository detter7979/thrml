import type { SupabaseClient } from "@supabase/supabase-js"

export const REQUIRED_LISTING_COLUMNS = new Set([
  "title",
  "service_type",
  "lat",
  "lng",
  "availability",
  "price_solo",
])

const MISSING_COLUMN_PATTERN = /'([^']+)' column of 'listings'/i

function parseMissingListingColumn(message: string): string | null {
  const match = message.match(MISSING_COLUMN_PATTERN) ?? message.match(/'([^']+)' column/i)
  return match?.[1] ?? null
}

export async function insertListingWithColumnFallback(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  options?: { maxAttempts?: number }
): Promise<{ data: { id: string } | null; error: string | null; code: string | null }> {
  const listingPayload = { ...payload }
  const maxAttempts = options?.maxAttempts ?? 32
  let lastMessage = "Failed to create listing."
  let lastCode: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from("listings")
      .insert(listingPayload)
      .select("id")
      .single()

    if (!error && data && typeof data.id === "string") {
      return { data: { id: data.id }, error: null, code: null }
    }

    lastMessage = error?.message ?? "Failed to create listing."
    lastCode = typeof error?.code === "string" ? error.code : null
    const missingColumn = parseMissingListingColumn(lastMessage)

    if (!missingColumn || !(missingColumn in listingPayload)) {
      return { data: null, error: lastMessage, code: lastCode }
    }

    if (REQUIRED_LISTING_COLUMNS.has(missingColumn)) {
      return {
        data: null,
        error: `Database schema is missing required column "${missingColumn}". Run the latest listings migration before publishing.`,
        code: lastCode,
      }
    }

    delete listingPayload[missingColumn]
  }

  console.error("[insertListingWithColumnFallback] exhausted column retries", {
    lastMessage,
    lastCode,
    remainingKeys: Object.keys(listingPayload),
  })

  return {
    data: null,
    error: lastMessage,
    code: lastCode,
  }
}
