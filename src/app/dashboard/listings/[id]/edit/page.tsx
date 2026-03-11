import { redirect } from "next/navigation"

import { getCancellationPolicy } from "@/lib/constants/cancellation-policies"
import { createClient } from "@/lib/supabase/server"

import { EditListingClient } from "./edit-listing-client"

async function getActiveBookingCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string
) {
  const fromView = await supabase
    .from("listing_booking_status")
    .select("active_booking_count")
    .eq("listing_id", listingId)
    .maybeSingle()

  if (!fromView.error && fromView.data?.active_booking_count !== undefined) {
    return Number(fromView.data.active_booking_count ?? 0)
  }

  const today = new Date().toISOString().slice(0, 10)
  const fallback = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .in("status", ["pending_host", "pending", "confirmed"])
    .gte("session_date", today)

  return Number(fallback.count ?? 0)
}

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fromClone?: string; originalTitle?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/dashboard/listings")

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("host_id", user.id)
    .maybeSingle()

  if (error || !listing) redirect("/dashboard/listings")

  const activeBookingCount = await getActiveBookingCount(supabase, id)
  const parentId = typeof listing.parent_listing_id === "string" ? listing.parent_listing_id : null
  const parentTitle = parentId
    ? (
        await supabase
          .from("listings")
          .select("title")
          .eq("id", parentId)
          .maybeSingle()
      ).data?.title ?? null
    : null

  return (
    <EditListingClient
      listing={{
        id: String(listing.id),
        title: typeof listing.title === "string" ? listing.title : "",
        description: typeof listing.description === "string" ? listing.description : "",
        serviceType: typeof listing.service_type === "string" ? listing.service_type : "sauna",
        location: typeof listing.location === "string" ? listing.location : "",
        amenities: Array.isArray(listing.amenities)
          ? listing.amenities.filter((item: unknown): item is string => typeof item === "string")
          : [],
        priceSolo: Number(listing.price_solo ?? 0),
        capacity: Number(listing.capacity ?? 1),
        cancellationPolicy:
          typeof listing.cancellation_policy === "string"
            ? listing.cancellation_policy
            : getCancellationPolicy(null).label.toLowerCase(),
        instantBook: Boolean(listing.is_instant_book ?? listing.instant_book),
        isActive: Boolean(listing.is_active),
        parentListingId: parentId,
        version: Number(listing.version ?? 1),
        timeSlotIncrement: Math.max(30, Number(listing.min_duration_override_minutes ?? 30)),
        serviceDurationMin:
          typeof listing.service_duration_min === "number" ? Number(listing.service_duration_min) : null,
        serviceDurationMax:
          typeof listing.service_duration_max === "number" ? Number(listing.service_duration_max) : null,
        serviceDurationUnit:
          listing.service_duration_unit === "hours" ? "hours" : "minutes",
        accessType:
          typeof listing.access_type === "string" ? listing.access_type : "code",
        accessCodeTemplate:
          typeof listing.access_code_template === "string"
            ? listing.access_code_template
            : typeof (listing as Record<string, unknown>).access_code === "string"
              ? ((listing as Record<string, unknown>).access_code as string)
              : "",
        accessCodeType:
          typeof listing.access_code_type === "string" ? listing.access_code_type : "static",
        accessInstructions:
          typeof listing.access_instructions === "string" ? listing.access_instructions : "",
        onsiteContactName:
          typeof (listing as Record<string, unknown>).onsite_contact_name === "string"
            ? ((listing as Record<string, unknown>).onsite_contact_name as string)
            : "",
        onsiteContactPhone:
          typeof (listing as Record<string, unknown>).onsite_contact_phone === "string"
            ? ((listing as Record<string, unknown>).onsite_contact_phone as string)
            : "",
        accessCodeSendTiming:
          typeof listing.access_code_send_timing === "string" ? listing.access_code_send_timing : "24h_before",
        houseRules: Array.isArray(listing.house_rules)
          ? listing.house_rules.filter((rule: unknown): rule is string => typeof rule === "string")
          : [],
        houseRulesCustom:
          typeof (listing as Record<string, unknown>).house_rules_custom === "string"
            ? ((listing as Record<string, unknown>).house_rules_custom as string)
            : null,
      }}
      activeBookingCount={activeBookingCount}
      originalTitleHint={typeof query.originalTitle === "string" ? query.originalTitle : null}
      parentTitle={parentTitle}
      fromClone={query.fromClone === "1"}
    />
  )
}
