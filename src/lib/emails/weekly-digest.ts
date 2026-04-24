import type { SupabaseClient } from "@supabase/supabase-js"

import { formatMoney } from "@/lib/cancellations"
import { getServiceLabel } from "@/lib/feeds/get-listings-for-feed"
import { listingPhotoThumbnailUrl } from "@/lib/listings/thumbnail-url"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

const DIGEST_SELECT =
  "id, title, service_type, session_type, fixed_session_price, price_solo, location_city, city, location_state, state, country, location, created_at, instant_book, listing_photos(url, order_index), listing_ratings(avg_overall, review_count)"

type DigestListingRow = {
  id: string
  title: string | null
  service_type: string | null
  session_type: string | null
  fixed_session_price: number | null
  price_solo: number | null
  location_city: string | null
  city: string | null
  location_state: string | null
  state: string | null
  country: string | null
  location: string | null
  created_at: string
  instant_book: boolean | null
  listing_photos: { url: string | null; order_index: number | null }[] | null
  listing_ratings:
    | { avg_overall: number | null; review_count: number | null }
    | { avg_overall: number | null; review_count: number | null }[]
    | null
}

export type WeeklyDigestSubscriber = {
  email: string
  market_city: string | null
  market_state: string | null
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function deriveLocation(listing: DigestListingRow): string {
  const city =
    (typeof listing.city === "string" && listing.city.trim()) ||
    (typeof listing.location_city === "string" && listing.location_city.trim()) ||
    ""
  const state =
    (typeof listing.state === "string" && listing.state.trim()) ||
    (typeof listing.location_state === "string" && listing.location_state.trim()) ||
    ""
  const country = typeof listing.country === "string" ? listing.country.trim() : ""
  const parts: string[] = []
  const seen = new Set<string>()
  for (const part of [city, state, country]) {
    if (!part) continue
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(part)
  }
  if (parts.length > 0) return parts.join(", ")
  const fallback =
    (typeof listing.location === "string" && listing.location.trim()) || "Location on listing page"
  return fallback
}

function listingPriceLabel(row: DigestListingRow): string {
  const isFixed = row.session_type === "fixed_session"
  const n = isFixed ? Number(row.fixed_session_price ?? 0) : Number(row.price_solo ?? 0)
  if (!Number.isFinite(n) || n <= 0) return "See listing"
  if (isFixed) return `${formatMoney(n)} / session`
  return `${formatMoney(n)} / hr`
}

function resolveListingStorageUrl(supabase: SupabaseClient, raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
  const normalizedPath = trimmed.replace(/^\/+/, "").replace(/^listing-photos\//, "")
  const { data } = supabase.storage.from("listing-photos").getPublicUrl(normalizedPath)
  return data.publicUrl || null
}

function bestPhotoUrl(supabase: SupabaseClient, row: DigestListingRow): string | null {
  const sorted = [...(row.listing_photos ?? [])].sort(
    (a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
  )
  for (const p of sorted) {
    const resolved = resolveListingStorageUrl(supabase, p.url)
    if (resolved) return listingPhotoThumbnailUrl(resolved, { width: 560, quality: 78 })
  }
  return null
}

function firstRating(row: DigestListingRow) {
  const lr = row.listing_ratings
  if (!lr) return null
  return Array.isArray(lr) ? lr[0] : lr
}

function ratingLine(row: DigestListingRow): string | null {
  const r = firstRating(row)
  const avg = r?.avg_overall
  const count = r?.review_count
  if (typeof avg !== "number" || !Number.isFinite(avg)) return null
  const c = typeof count === "number" && count > 0 ? ` (${count})` : ""
  return `${avg.toFixed(1)}★${c}`
}

function normalizeMarketKey(locationLabel: string): string {
  return locationLabel.split(",")[0]?.trim().toLowerCase() ?? ""
}

/** Prefer one listing per metro/area so the digest reads like a marketplace snapshot. */
export function pickDiverseRecentListings(rows: DigestListingRow[], max: number): DigestListingRow[] {
  const picked: DigestListingRow[] = []
  const seenKeys = new Set<string>()
  for (const row of rows) {
    const key = normalizeMarketKey(deriveLocation(row)) || row.id
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    picked.push(row)
    if (picked.length >= max) break
  }
  if (picked.length >= max) return picked
  for (const row of rows) {
    if (picked.some((p) => p.id === row.id)) continue
    picked.push(row)
    if (picked.length >= max) break
  }
  return picked
}

function activeListingQuery(supabase: SupabaseClient, sinceIso: string | null) {
  let q = supabase
    .from("listings")
    .select(DIGEST_SELECT)
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_draft", false)
    .order("created_at", { ascending: false })
    .limit(48)
  if (sinceIso) q = q.gte("created_at", sinceIso)
  return q
}

export async function countNewListingsThisWeek(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_draft", false)
    .gte("created_at", since)
  return count ?? 0
}

export async function fetchListingsForWeeklyDigest(
  supabase: SupabaseClient,
  options: { marketCity: string | null; marketState: string | null; newThisWeekCount?: number }
): Promise<{ rows: DigestListingRow[]; usedMarketFilter: boolean; newThisWeekCount: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const newThisWeekCount =
    typeof options.newThisWeekCount === "number"
      ? options.newThisWeekCount
      : await countNewListingsThisWeek(supabase)

  const city = options.marketCity?.trim().replaceAll(",", " ") ?? ""

  if (city.length >= 2) {
    const safe = city.replaceAll("%", "").replaceAll("_", "").trim()
    const pattern = `%${safe}%`
    const { data: marketRows, error: marketError } = await supabase
      .from("listings")
      .select(DIGEST_SELECT)
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_draft", false)
      .gte("created_at", since)
      .or(`city.ilike.${pattern},location_city.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(24)

    if (!marketError && marketRows?.length) {
      return {
        rows: (marketRows as DigestListingRow[]).slice(0, 6),
        usedMarketFilter: true,
        newThisWeekCount,
      }
    }
  }

  const { data: weekRows } = await activeListingQuery(supabase, since)
  const week = (weekRows ?? []) as DigestListingRow[]
  if (week.length >= 3) {
    return { rows: pickDiverseRecentListings(week, 6), usedMarketFilter: false, newThisWeekCount }
  }

  const { data: fallbackRows } = await activeListingQuery(supabase, null)
  const fallback = (fallbackRows ?? []) as DigestListingRow[]
  return {
    rows: pickDiverseRecentListings(fallback, 6),
    usedMarketFilter: false,
    newThisWeekCount,
  }
}

function renderListingCardHtml(supabase: SupabaseClient, row: DigestListingRow): string {
  const url = `${APP_URL}/listings/${row.id}`
  const title = escapeHtml(row.title?.trim() || "Wellness space")
  const location = escapeHtml(deriveLocation(row))
  const typeLabel = escapeHtml(getServiceLabel(row.service_type ?? "wellness_space"))
  const price = escapeHtml(listingPriceLabel(row))
  const rating = ratingLine(row)
  const ratingHtml = rating
    ? `<span style="color:#5B4A40;font-size:13px;">${escapeHtml(rating)}</span>`
    : ""
  const instant =
    row.instant_book === true
      ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#E8F5E9;color:#1B5E20;font-size:11px;font-weight:700;letter-spacing:0.02em;">Instant book</span>`
      : ""
  const imgUrl = bestPhotoUrl(supabase, row)
  const imageBlock = imgUrl
    ? `<a href="${url}" style="text-decoration:none;color:inherit;">
        <img src="${escapeHtml(imgUrl)}" alt="" width="532" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:12px 12px 0 0;object-fit:cover;aspect-ratio:16/10;background:#E9DED4;" />
      </a>`
    : `<a href="${url}" style="display:block;text-decoration:none;background:linear-gradient(145deg,#3D2E26,#1A1410);border-radius:12px 12px 0 0;min-height:140px;"></a>`

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;border-collapse:separate;border:1px solid #E3D7CC;border-radius:12px;overflow:hidden;background:#fff;">
    <tr>
      <td style="padding:0;line-height:0;font-size:0;">${imageBlock}</td>
    </tr>
    <tr>
      <td style="padding:18px 18px 20px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8B6F5C;">${typeLabel}${instant}</p>
        <h2 style="margin:0 0 8px;font-size:18px;line-height:1.25;font-weight:700;color:#1F1914;">
          <a href="${url}" style="color:#1F1914;text-decoration:none;">${title}</a>
        </h2>
        <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#5B4A40;">${location}</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:#1F1914;">${price}${ratingHtml ? ` · ${ratingHtml}` : ""}</p>
        <p style="margin:14px 0 0;">
          <a href="${url}" style="display:inline-block;font-size:14px;font-weight:700;color:#C4623A;text-decoration:none;">View space →</a>
        </p>
      </td>
    </tr>
  </table>`
}

export function buildWeeklyDigestEmail(args: {
  supabase: SupabaseClient
  unsubUrl: string
  exploreUrl: string
  listings: DigestListingRow[]
  newThisWeekCount: number
  usedMarketFilter: boolean
  marketCity: string | null
}): { subject: string; html: string; text: string } {
  const { listings, newThisWeekCount, usedMarketFilter, marketCity, exploreUrl, unsubUrl } = args
  const metro = marketCity?.trim() ?? ""

  const subject =
    newThisWeekCount > 0
      ? usedMarketFilter && metro
        ? `${newThisWeekCount} new space${newThisWeekCount === 1 ? "" : "s"} in ${metro} this week`
        : `${newThisWeekCount} new wellness space${newThisWeekCount === 1 ? "" : "s"} this week`
      : usedMarketFilter && metro
        ? `Wellness spaces in ${metro} — hand-picked for you`
        : "Private wellness spaces you can book by the hour"

  const intro =
    newThisWeekCount > 0
      ? usedMarketFilter && metro
        ? `Here are real spaces hosts just listed in <strong>${escapeHtml(metro)}</strong> — book saunas, cold plunges, and more without a membership.`
        : `Here are some of the newest spaces on Thrml this week — real listings you can book right now.`
      : usedMarketFilter && metro
        ? `Inventory changes fast. Here are active spaces in <strong>${escapeHtml(metro)}</strong> worth a look right now.`
        : `Private recovery spaces are live on Thrml — saunas, cold plunges, float tanks, and more. Here are a few standout listings.`

  const cardsHtml = listings.map((row) => renderListingCardHtml(args.supabase, row)).join("\n")

  const cardsOrFallback =
    listings.length > 0
      ? cardsHtml
      : `<p style="font-size:15px;line-height:1.8;color:#3E3329;margin:0;">Browse live spaces on Thrml — new hosts join every week.</p>`

  const html = `
      <div style="background:#FAF7F4;padding:36px 20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2C2420;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #E9DED4;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(26,20,16,0.06);">
          <div style="background:#1A1410;padding:22px 26px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.14em;">THRML</span>
            <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.72);line-height:1.5;">This week's spaces · real listings · book by the hour</p>
          </div>
          <div style="padding:30px 26px 26px;">
            <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:#1F1914;">Weekly spaces update</h1>
            <p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#3E3329;">${intro}</p>
            ${cardsOrFallback}
            <p style="margin:28px 0 0;">
              <a href="${exploreUrl}" style="display:inline-block;background:#C4623A;color:#fff;
                text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">
                Browse all spaces →
              </a>
            </p>
          </div>
          <div style="padding:16px 26px 22px;border-top:1px solid #E9DED4;background:#FFFBF8;">
            <p style="margin:0;font-size:12px;line-height:1.65;color:#796A5E;">
              Thrml · <a href="${unsubUrl}" style="color:#796A5E;text-decoration:underline;">Unsubscribe</a>
            </p>
          </div>
        </div>
      </div>`

  const textLines = [
    subject,
    "",
    "Weekly spaces update",
    "",
    newThisWeekCount > 0
      ? usedMarketFilter && metro
        ? `New listings in ${metro} and more on Thrml.`
        : `${newThisWeekCount} new space(s) this week on Thrml.`
      : "See what's available on Thrml.",
    "",
  ]
  for (const row of listings) {
    const loc = deriveLocation(row)
    textLines.push(
      `• ${row.title ?? "Listing"} — ${loc} — ${listingPriceLabel(row)}`,
      `  ${APP_URL}/listings/${row.id}`,
      ""
    )
  }
  textLines.push(`Explore: ${exploreUrl}`, `Unsubscribe: ${unsubUrl}`)

  return { subject, html, text: textLines.join("\n") }
}
