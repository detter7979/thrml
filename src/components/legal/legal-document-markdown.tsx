"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { CookieSettingsLink } from "@/components/cookie-settings-link"

const linkClass = "text-[#C4623A] underline hover:text-[#b05530]"

type LegalDocumentMarkdownProps = {
  body: string
}

function renderWithCookieSettings(text: string) {
  const parts = text.split(/(Cookie Settings)/g)
  if (parts.length === 1) return text

  return parts.map((part, index) =>
    part === "Cookie Settings" ? (
      <CookieSettingsLink key={index} className={linkClass} />
    ) : (
      part
    )
  )
}

function processChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") return renderWithCookieSettings(children)
  if (Array.isArray(children)) return children.map((child) => processChildren(child))
  return children
}

export function LegalDocumentMarkdown({ body }: LegalDocumentMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => (
          <h2 className="mt-8 text-base font-semibold text-[#1A1410] first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-6 text-sm font-semibold text-[#1A1410]">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mt-3 text-sm leading-relaxed text-[#2F241E]">{processChildren(children)}</p>
        ),
        ul: ({ children }) => (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#2F241E]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[#2F241E]">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{processChildren(children)}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[#1A1410]">{children}</strong>,
        a: ({ href, children }) => {
          if (href === "#open-cookie-settings") {
            return <CookieSettingsLink className={linkClass} />
          }
          if (href?.startsWith("/")) {
            return (
              <Link href={href} className={linkClass}>
                {children}
              </Link>
            )
          }
          return (
            <a href={href} className={linkClass} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        },
        table: ({ children }) => (
          <div className="mt-5 overflow-x-auto rounded-xl border border-[#E8DDD6]">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-[#E8DDD6] bg-[#FAF6F2]">{children}</thead>
        ),
        tbody: ({ children }) => <tbody className="divide-y divide-[#F0E8E2]">{children}</tbody>,
        tr: ({ children }) => <tr className="bg-white even:bg-[#FAF6F2]">{children}</tr>,
        th: ({ children }) => (
          <th className="px-4 py-3 text-left font-medium text-[#5F5148]">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-[#2F241E]">{processChildren(children)}</td>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  )
}
