interface GA4MPEvent {
  name: string
  params: Record<string, unknown>
}

export async function sendGA4Event({
  clientId,
  events,
}: {
  clientId: string
  events: GA4MPEvent[]
}): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (!measurementId) {
    throw new Error("NEXT_PUBLIC_GA_MEASUREMENT_ID env var is required")
  }

  const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_SECRET
  if (!apiSecret) {
    throw new Error("GA4_MEASUREMENT_PROTOCOL_SECRET env var is required")
  }

  try {
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          events,
        }),
      }
    )

    if (!response.ok) {
      console.error("[GA4 MP] Request failed", response.status)
    }
  } catch (err) {
    // Never throw — tracking must never break booking flow.
    console.error("[GA4 MP] Send failed:", err)
  }
}
