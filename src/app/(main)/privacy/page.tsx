import type { Metadata } from "next"

import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { fetchActiveLegalDocument } from "@/lib/legal/fetch-document"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how thrml collects, uses, and protects your personal information.",
  alternates: { canonical: "https://usethrml.com/privacy" },
}

export default async function PrivacyPage() {
  const document = await fetchActiveLegalDocument("privacy_policy")
  return <LegalDocumentView document={document} showPrivacyRequestLink />
}
