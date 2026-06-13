import type { Metadata } from "next"

import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { fetchActiveLegalDocument } from "@/lib/legal/fetch-document"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Host Terms of Service",
  description: "Terms and obligations for hosts listing wellness spaces on thrml.",
  alternates: { canonical: "https://usethrml.com/legal/host-terms" },
}

export default async function LegalHostTermsPage() {
  const document = await fetchActiveLegalDocument("host_terms")
  return <LegalDocumentView document={document} />
}
