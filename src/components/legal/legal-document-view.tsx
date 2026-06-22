import Link from "next/link"

import { LegalDocumentMarkdown } from "@/components/legal/legal-document-markdown"
import { formatLegalEffectiveDate } from "@/lib/legal/fetch-document"
import type { LegalDocumentContent } from "@/lib/legal/fallback-content"
import { sanitizeLegalBody } from "@/lib/legal/sanitize-legal-body"

type LegalDocumentViewProps = {
  document: LegalDocumentContent
  showPrivacyRequestLink?: boolean
}

export function LegalDocumentView({ document, showPrivacyRequestLink = false }: LegalDocumentViewProps) {
  const body = sanitizeLegalBody(document.body, document.title)

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

      <div className="mt-8">
        <LegalDocumentMarkdown body={body} />
      </div>

      {showPrivacyRequestLink ? (
        <section className="mt-10 rounded-xl border border-[#E8DDD6] bg-[#FAF6F2] px-5 py-4">
          <p className="text-sm leading-relaxed text-[#2F241E]">
            To exercise your privacy rights,{" "}
            <Link href="/privacy-request" className="font-medium text-[#C4623A] underline hover:text-[#b05530]">
              submit a privacy request
            </Link>
            . We respond within 30 days.
          </p>
        </section>
      ) : null}
    </main>
  )
}
