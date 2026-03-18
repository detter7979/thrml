import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const payloadSchema = z
  .object({
    houseRules: z.array(z.string().trim().min(1).max(160)).max(20),
    applyToListings: z.boolean().optional().default(true),
  })
  .strict()

function sanitizeRule(input: string): string {
  if (!input) return ""
  // Keep rules plain-text to avoid HTML/script content while preserving readability.
  return input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid house rules payload." }, { status: 400 })
    }

    const uniqueRules: string[] = []
    for (const rule of parsed.data.houseRules) {
      const normalized = sanitizeRule(rule)
      if (!normalized) continue
      if (!uniqueRules.includes(normalized)) uniqueRules.push(normalized)
    }

    const { data: profileRowsById, error: profileUpdateByIdError } = await supabase
      .from("profiles")
      .update({ house_rules: uniqueRules })
      .eq("id", user.id)
      .select("id")

    let warning: string | null = null
    let profileUpdateError = profileUpdateByIdError

    if (!profileUpdateError && (!profileRowsById || profileRowsById.length === 0)) {
      const { error: profileUpdateByUserIdError } = await supabase
        .from("profiles")
        .update({ house_rules: uniqueRules })
        .eq("user_id", user.id)
        .select("id")

      const isMissingUserIdColumn = Boolean(
        profileUpdateByUserIdError?.message?.includes("column profiles.user_id does not exist")
      )
      if (!isMissingUserIdColumn) {
        profileUpdateError = profileUpdateByUserIdError
      }
    }

    if (profileUpdateError) {
      const isMissingColumn =
        /column\s+profiles\.house_rules\s+does not exist/i.test(profileUpdateError.message ?? "") ||
        /house_rules/.test(profileUpdateError.message ?? "")

      if (!isMissingColumn) {
        return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
      }
      warning = "Saved to listings only. Add profiles.house_rules to store host defaults."
    }

    if (parsed.data.applyToListings) {
      const { error: listingUpdateError } = await supabase
        .from("listings")
        .update({ house_rules: uniqueRules })
        .eq("host_id", user.id)

      if (listingUpdateError) {
        return NextResponse.json({ error: listingUpdateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      warning,
      message: parsed.data.applyToListings
        ? "House rules updated across your listings."
        : "Default house rules saved.",
      houseRules: uniqueRules,
    })
  } catch (error) {
    console.error("Failed to save host house rules", error)
    return NextResponse.json({ error: "Unable to save house rules right now." }, { status: 500 })
  }
}
