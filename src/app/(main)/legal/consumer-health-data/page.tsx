import type { Metadata } from "next"

import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { fetchActiveLegalDocument } from "@/lib/legal/fetch-document"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Consumer Health Data Privacy Policy",
  description:
    "How thrml handles consumer health data under Washington MHMDA and similar state privacy laws.",
  alternates: { canonical: "https://usethrml.com/legal/consumer-health-data" },
}

export default async function ConsumerHealthDataPolicyPage() {
  const document = await fetchActiveLegalDocument("consumer_health_data_policy")
  return <LegalDocumentView document={document} showPrivacyRequestLink />
}
