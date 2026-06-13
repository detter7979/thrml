import type { Metadata } from "next"

import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { fetchActiveLegalDocument } from "@/lib/legal/fetch-document"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read thrml's Terms of Service governing use of our wellness marketplace.",
  alternates: { canonical: "https://usethrml.com/legal/terms" },
}

export default async function LegalTermsPage() {
  const document = await fetchActiveLegalDocument("terms_of_service")
  return <LegalDocumentView document={document} />
}
