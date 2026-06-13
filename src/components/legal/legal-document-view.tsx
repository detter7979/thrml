import Link from "next/link"

import { formatLegalEffectiveDate } from "@/lib/legal/fetch-document"
import type { LegalDocumentContent } from "@/lib/legal/fallback-content"

type LegalDocumentViewProps = {
  document: LegalDocumentContent
  showPrivacyRequestLink?: boolean
}

export function LegalDocumentView({ document, showPrivacyRequestLink = false }: LegalDocumentViewProps) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-[#1A1410] md:px-8">
      <h1 className="font-serif text-4xl">{document.title}</h1>
      <p className="mt-2 text-sm text-[#5F5148]">thrml Wellness Marketplace — usethrml.com</p>
      <p className="mt-3 text-sm text-[#5F5148]">
        <span className="font-medium text-[#2F241E]">Version:</span> {document.version}
        <span className="mx-2 text-[#C4B5A8]">·</span>
        <span className="font-medium text-[#2F241E]">Effective:</span>{" "}
        {formatLegalEffectiveDate(document.effectiveAt)}
      </p>

      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-[#2F241E]">{document.body}</div>

      {showPrivacyRequestLink ? (
        <p className="mt-8 text-sm text-[#5F5148]">
          To exercise your privacy rights,{" "}
          <Link href="/privacy-request" className="text-[#C4623A] underline hover:text-[#b05530]">
            submit a privacy request
          </Link>
          . We respond within 30 days.
        </p>
      ) : null}
    </main>
  )
}
