"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"

export function AdminMessagesClient({ initialRecipient }: { initialRecipient: string }) {
  const router = useRouter()
  const [recipient, setRecipient] = useState(initialRecipient)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!recipient.trim() || !body.trim()) {
      setError("Recipient and message are required.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipient.trim(),
          subject: subject.trim() || null,
          body,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        conversationId?: string
      }
      if (!response.ok || !payload.conversationId) {
        setError(payload.error ?? "Unable to send message.")
        return
      }
      router.push(`/dashboard/messages/${payload.conversationId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <h1 className="font-serif text-3xl text-[#2A2118]">Direct messaging</h1>
      <p className="text-sm text-[#6E5B49]">Send a direct message to any user by email or user ID.</p>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="max-w-2xl space-y-3 rounded-2xl border border-[#D9CBB8] bg-[#FCF8F3] p-4"
      >
        <label className="block space-y-1">
          <span className="text-xs text-[#6E5B49]">Recipient (email or user ID)</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
            placeholder="user@email.com or uuid"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-[#6E5B49]">Subject / context label</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
            placeholder="Refund follow-up"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-[#6E5B49]">Message body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-[#D9CBB8] bg-white px-3 py-2 text-sm text-[#2A2118]"
            placeholder="Hi there, reaching out from thrml support..."
          />
        </label>

        <Button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[#C75B3A] text-white hover:bg-[#B04E30]"
        >
          {submitting ? "Sending..." : "Send message"}
        </Button>
      </form>
    </div>
  )
}
