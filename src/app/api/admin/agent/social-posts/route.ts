import { NextRequest, NextResponse } from "next/server"

import { requireAdminApi } from "@/lib/admin-guard"
import {
  generateSocialPosts,
  isSocialPillar,
  isSocialPlatform,
  SOCIAL_STATUS,
  type SocialPlatformKey,
} from "@/lib/agent/social-generator"

// Generating 4 posts runs 4 sequential Claude calls.
export const maxDuration = 120

const LIST_COLUMNS =
  "id, status, hook, format, visual_direction, copy_primary, cta, trigger_data, created_at, approved_at, rejected_at, published_at, publish_platform_id, created_by"

/** Social drafts, the approved publish queue, and the last 20 published or rejected posts. */
export async function GET() {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const [open, history] = await Promise.all([
    admin!
      .from("creative_briefs")
      .select(LIST_COLUMNS)
      .eq("trigger_type", "social")
      .in("status", [SOCIAL_STATUS.draft, SOCIAL_STATUS.approved])
      .order("created_at", { ascending: false })
      .limit(100),
    admin!
      .from("creative_briefs")
      .select(LIST_COLUMNS)
      .eq("trigger_type", "social")
      .in("status", [SOCIAL_STATUS.published, SOCIAL_STATUS.rejected])
      .order("created_at", { ascending: false })
      .limit(20),
  ])
  const firstError = open.error ?? history.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })

  return NextResponse.json({
    drafts: (open.data ?? []).filter((p) => p.status === SOCIAL_STATUS.draft),
    approved: (open.data ?? []).filter((p) => p.status === SOCIAL_STATUS.approved),
    history: history.data ?? [],
  })
}

/** Generate posts on demand: { pillar?, platforms?: string[], direction?: string } */
export async function POST(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => ({}))) as {
    pillar?: unknown
    platforms?: unknown
    direction?: unknown
  }
  if (body.pillar != null && !isSocialPillar(body.pillar)) {
    return NextResponse.json({ error: "Unknown pillar" }, { status: 400 })
  }
  const platforms = Array.isArray(body.platforms) ? body.platforms.filter(isSocialPlatform) : undefined
  if (Array.isArray(body.platforms) && platforms!.length === 0) {
    return NextResponse.json({ error: "Pick at least one platform" }, { status: 400 })
  }
  const direction = typeof body.direction === "string" ? body.direction.trim().slice(0, 500) : undefined

  const outcome = await generateSocialPosts(admin!, {
    source: "admin",
    pillar: body.pillar ?? undefined,
    platforms: platforms as SocialPlatformKey[] | undefined,
    direction: direction || undefined,
  })
  const status = outcome.created.length === 0 ? 502 : 200
  return NextResponse.json(outcome, { status })
}

/** Review a post: { id, action: "approve" | "reject" | "reopen", caption?, hook? } */
export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireAdminApi()
  if (error) return error

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown
    action?: unknown
    caption?: unknown
    hook?: unknown
  }
  if (typeof body.id !== "string") return NextResponse.json({ error: "Expected id" }, { status: 400 })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {}
  if (typeof body.caption === "string") update.copy_primary = body.caption
  if (typeof body.hook === "string") update.hook = body.hook

  if (body.action === "approve") Object.assign(update, { status: SOCIAL_STATUS.approved, approved_at: now, rejected_at: null })
  else if (body.action === "reject") Object.assign(update, { status: SOCIAL_STATUS.rejected, rejected_at: now })
  else if (body.action === "reopen") Object.assign(update, { status: SOCIAL_STATUS.draft, approved_at: null, rejected_at: null })
  else if (body.action != null) return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error: updateError } = await admin!
    .from("creative_briefs")
    .update(update)
    .eq("id", body.id)
    .eq("trigger_type", "social")
    .neq("status", SOCIAL_STATUS.published)
    .select(LIST_COLUMNS)
    .maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Post not found or already published" }, { status: 404 })
  return NextResponse.json({ post: data })
}
