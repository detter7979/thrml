export type Listing = {
  id: string
  title: string
  location: string | null
  lat: number | null
  lng: number | null
  price_solo: number
  price_2?: number | null
  price_3?: number | null
  price_4plus?: number | null
}

export type Booking = {
  id: string
  listing_id: string
  guest_id: string
  host_id: string
  status: "pending_host" | "pending" | "confirmed" | "completed" | "cancelled" | "declined"
  total_charged: number
}
