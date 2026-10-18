"use server"

import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/admin-guard"
import { type EditableTag, type ReorganizeResult, reorganizeCreativeLibrary, updateCreativeTags } from "@/lib/creative/library"

export async function saveCreativeTags(
  id: string,
  patch: Partial<Record<EditableTag, string | null>> & { tags?: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin } = await requireAdmin()
  try {
    await updateCreativeTags(admin, id, patch)
    revalidatePath("/admin/paid-media/creative")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function reorganizeCreativeFiles(): Promise<({ ok: true } & ReorganizeResult) | { ok: false; error: string }> {
  const { admin } = await requireAdmin()
  try {
    const result = await reorganizeCreativeLibrary(admin)
    revalidatePath("/admin/paid-media/creative")
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
