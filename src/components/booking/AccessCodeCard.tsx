"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export function AccessCodeCard({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="w-full max-w-[220px] shrink-0 rounded-lg border border-[#F1D4BA] bg-[#FFF4E8] p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#C75B3A]">Access code</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-mono text-sm tracking-[0.2em] text-[#C75B3A]">{code ?? "Pending"}</p>
        {code ? (
          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex items-center gap-1 rounded-md border border-[#E8BE9A] bg-[#FFF9F3] px-2 py-1 text-xs text-[#C75B3A] hover:bg-[#FFF1E5]"
          >
            {copied ? (
              <>
                <Check className="size-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}
