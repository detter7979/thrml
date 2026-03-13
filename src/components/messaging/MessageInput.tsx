"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { resolveInstructions } from "@/lib/constants/access-types"
import { createClient } from "@/lib/supabase/client"

type QuickReply = {
  label: string
  templateType: string
  content: string
}

const HOST_QUICK_REPLY_FALLBACKS: QuickReply[] = [
  {
    label: "👋 Welcome",
    templateType: "booking_confirmed",
    content:
      "Welcome! Really glad to have you booking " +
      "with me. Let me know if you have any " +
      "questions before your session - happy " +
      "to help with anything.",
  },
  {
    label: "📍 Access details",
    templateType: "access_instructions",
    content:
      "Here are your access details for the " +
      "session. [Entry instructions will appear " +
      "here once configured in your listing " +
      "settings.] Feel free to message me if " +
      "you have any trouble getting in.",
  },
  {
    label: "⏰ Reminder",
    templateType: "pre_arrival",
    content:
      "Just a reminder that your session is " +
      "coming up soon. Everything is ready for " +
      "you - see you there! Message me if " +
      "anything comes up.",
  },
  {
    label: "✅ Check-in",
    templateType: "check_in",
    content:
      "Hope you got in okay! Let me know if " +
      "you need anything during your session. " +
      "I'm available if anything comes up.",
  },
  {
    label: "⭐ Review request",
    templateType: "review_request",
    content:
      "Thanks so much for booking - hope you " +
      "had a great session! If you have a " +
      "moment, I'd really appreciate a review. " +
      "It helps a lot and only takes a minute.",
  },
]

export function MessageInput({
  conversationId,
  currentUserId,
  otherPartyName,
  isHost,
  bookingContext,
  onSend,
}: {
  conversationId: string
  currentUserId: string
  otherPartyName: string
  isHost: boolean
  bookingContext?: {
    access_code?: string | null
    session_date?: string | null
    start_time?: string | null
    duration_hours?: number | null
  } | null
  onSend: (message: {
    id: string
    conversation_id: string
    sender_id: string
    body: string
    message_type: string
    created_at: string
    read_at: string | null
  }) => void
}) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [templates, setTemplates] = useState<QuickReply[]>(HOST_QUICK_REPLY_FALLBACKS)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase.channel(`typing:${conversationId}`, {
        config: { presence: { key: conversationId } },
      })
      typingChannelRef.current = channel
      channel.subscribe()
    } catch (error) {
      typingChannelRef.current = null
      console.warn("Typing presence unavailable, continuing without realtime typing.", error)
    }

    return () => {
      if (!channel) return
      void channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [conversationId, supabase])

  useEffect(() => {
    if (!isHost) return
    let cancelled = false
    async function loadTemplates() {
      // TODO: fetch per-listing custom templates from quick_reply_templates table when host customization is implemented.
      const response = await fetch("/api/messages/templates")
      if (!response.ok) return
      const payload = (await response.json()) as {
        templates: Array<{ template_type: string; content: string }>
      }
      if (cancelled) return
      const map = new Map(payload.templates.map((item) => [item.template_type, item.content]))
      setTemplates(
        HOST_QUICK_REPLY_FALLBACKS.map((item) => ({
          ...item,
          content: map.get(item.templateType) ?? item.content,
        }))
      )
    }
    void loadTemplates()
    return () => {
      cancelled = true
    }
  }, [isHost])

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = "auto"
    const maxHeight = 24 * 4 + 16
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
  }, [value])

  useEffect(() => {
    if (typeof window === "undefined") return
    const viewport = window.visualViewport
    if (!viewport) return
    const handler = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height)
      setKeyboardOffset(offset)
    }
    viewport.addEventListener("resize", handler)
    handler()
    return () => viewport.removeEventListener("resize", handler)
  }, [])

  async function submit() {
    const body = value.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setSendError(payload.error ?? "Message could not be sent. Please try again.")
        return
      }
      const payload = (await response.json()) as {
        message: {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          message_type: string
          created_at: string
          read_at: string | null
        }
      }
      onSend(payload.message)
      setValue("")
      await typingChannelRef.current?.untrack()
    } catch {
      setSendError("Message could not be sent. Please check your connection.")
    } finally {
      setSending(false)
    }
  }

  function insertQuickReply(template: QuickReply) {
    const formattedSessionDate = bookingContext?.session_date
      ? new Date(`${bookingContext.session_date}T12:00:00`).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : ""
    const formattedStartTime =
      bookingContext?.session_date && bookingContext?.start_time
        ? new Date(`${bookingContext.session_date}T${bookingContext.start_time}`).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : ""
    const formattedDuration = bookingContext?.duration_hours
      ? `${bookingContext.duration_hours} hour${bookingContext.duration_hours === 1 ? "" : "s"}`
      : ""
    const guestFirstName = otherPartyName.split(" ")[0] ?? "Guest"
    const resolved = resolveInstructions(template.content, {
      code: bookingContext?.access_code ?? undefined,
      date: formattedSessionDate,
      time: formattedStartTime,
      guestName: guestFirstName,
      duration: formattedDuration,
    })
    setValue(resolved)
    textareaRef.current?.focus()
  }

  async function trackTyping(nextValue: string) {
    setValue(nextValue)
    if (!typingChannelRef.current) return
    if (!nextValue.trim()) {
      await typingChannelRef.current.untrack()
      return
    }
    await typingChannelRef.current.track({
      typing: true,
      user_id: currentUserId,
      updated_at: Date.now(),
    })
  }

  return (
    <div
      className="sticky border-t border-[#E7DED3] bg-[#F7F3EE]/95 px-4 py-3 backdrop-blur"
      style={{ bottom: keyboardOffset }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        maxLength={1200}
        onChange={(event) => void trackTyping(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        className="max-h-28 w-full resize-none rounded-md border border-[#E5DBCF] bg-white px-3 py-2 text-base outline-none focus:border-[#C75B3A]"
        placeholder={`Message ${otherPartyName}...`}
      />
      {isHost ? (
        <div className="mt-2 flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {templates.map((reply) => (
            <button
              key={reply.label}
              type="button"
              onClick={() => insertQuickReply(reply)}
              className="shrink-0 rounded-full border border-[#E7DCCE] bg-white px-2.5 py-1 text-xs text-[#6B5A4E] hover:bg-[#FFF6EE]"
            >
              {reply.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-end gap-3">
        {sendError ? <span className="mr-auto text-xs text-red-600">{sendError}</span> : null}
        {value.length > 200 ? <span className="text-[11px] text-[#8C7B6E]">{value.length}/1200</span> : null}
        <Button
          size="icon"
          className="h-9 w-9 rounded-full bg-[#C75B3A] text-white hover:bg-[#B44D31]"
          disabled={!value.trim().length || sending}
          onClick={() => void submit()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
