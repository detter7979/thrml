import type { SupabaseClient } from "@supabase/supabase-js"

export type AdminAuditAction =
  | "refund"
  | "toggle_admin"
  | "toggle_ban"
  | "grant_credit"
  | "listing_delete"
  | "listing_status"
  | "dispute_resolve"
  | "settings_update"
  | "namer_sheet.write"
  | "namer_sheet.batch_update"

/**
 * Record an admin action in admin_audit_log. Never throws: a logging failure must not
 * undo or block the action itself, so it is only reported to the console.
 */
export async function logAdminAction(
  admin: SupabaseClient,
  entry: {
    adminId: string | null | undefined
    action: AdminAuditAction
    targetType?: string
    targetId?: string | null
    details?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: entry.adminId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
    })
    if (error) console.error("[admin-audit] insert failed", entry.action, error.message)
  } catch (e) {
    console.error("[admin-audit] insert threw", entry.action, e)
  }
}
