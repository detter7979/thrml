"use client"

import { useEffect } from "react"

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Messages page error:", error)
  }, [error])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-8 text-center">
      <p className="mb-2 text-sm text-neutral-500">Something went wrong loading your messages.</p>
      <p className="mb-6 text-xs font-mono text-red-400">{error.message}</p>
      <button onClick={reset} className="text-sm text-[#C4623A] underline">
        Try again
      </button>
    </div>
  )
}
