import { createAdminClient } from "@/lib/supabase/admin"

import { LEGAL_FALLBACK, type LegalDocTypeKey, type LegalDocumentContent } from "./fallback-content"

type DbLegalRow = {
  title: string
  version: string
  body: string
  effective_at: string
}

export async function fetchActiveLegalDocument(
  docType: LegalDocTypeKey
): Promise<LegalDocumentContent> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("legal_documents")
      .select("title, version, body, effective_at")
      .eq("doc_type", docType)
      .eq("is_active", true)
      .maybeSingle()

    if (!error && data) {
      const row = data as DbLegalRow
      return {
        title: row.title,
        version: row.version,
        effectiveAt: row.effective_at,
        body: row.body,
      }
    }
  } catch {
    // Table may not exist yet — fall back to hardcoded content.
  }

  return LEGAL_FALLBACK[docType]
}

export function formatLegalEffectiveDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
