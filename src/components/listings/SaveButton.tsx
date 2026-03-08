"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Heart } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

type SaveButtonProps = {
  listingId: string
  initialSaved?: boolean
  variant?: "card" | "detail"
  className?: string
  onSavedChange?: (saved: boolean) => void
}

export function SaveButton({
  listingId,
  initialSaved = false,
  variant = "card",
  className,
  onSavedChange,
}: SaveButtonProps) {
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [saved, setSaved] = useState(initialSaved)
  const [hovered, setHovered] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const pulseTimeoutRef = useRef<number | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    const loadSavedState = async (id: string) => {
      const { data } = await supabase
        .from("saved_listings")
        .select("id")
        .eq("user_id", id)
        .eq("listing_id", listingId)
        .single()

      if (!mounted) return
      setSaved(Boolean(data))
    }

    const syncAuthState = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return

      const sessionUserId = session?.user?.id ?? null
      if (sessionUserId) {
        setUserId(sessionUserId)
        await loadSavedState(sessionUserId)
        if (!mounted) return
        setAuthResolved(true)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!mounted) return

      if (!user?.id) {
        setUserId(null)
        setSaved(false)
        setAuthResolved(true)
        return
      }

      setUserId(user.id)
      await loadSavedState(user.id)
      if (!mounted) return
      setAuthResolved(true)
    }

    void syncAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null
      setUserId(nextUserId)
      setAuthResolved(true)
      if (!nextUserId) {
        setSaved(false)
        return
      }
      void loadSavedState(nextUserId)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    }
  }, [listingId, supabase])

  function showToast(message: string) {
    setToast(message)
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 1800)
  }

  function triggerPulse() {
    setPulse(true)
    if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
    pulseTimeoutRef.current = window.setTimeout(() => setPulse(false), 200)
  }

  async function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    let resolvedUserId = userId
    if (!resolvedUserId) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      resolvedUserId = session?.user?.id ?? null
      if (resolvedUserId) {
        setUserId(resolvedUserId)
      }
    }

    if (!resolvedUserId) {
      if (!authResolved) return
      setLoginOpen(true)
      return
    }

    const previous = saved
    const next = !previous
    setSaved(next)
    onSavedChange?.(next)

    if (next) {
      triggerPulse()
      if (variant === "detail") showToast("Added to saved spaces")
    } else if (variant === "detail") {
      showToast("Removed from saved spaces")
    }

    const { error } = next
      ? await supabase.from("saved_listings").insert({
          user_id: resolvedUserId,
          listing_id: listingId,
        })
      : await supabase
          .from("saved_listings")
          .delete()
          .eq("user_id", resolvedUserId)
          .eq("listing_id", listingId)

    if (error) {
      setSaved(previous)
      onSavedChange?.(previous)
    }
  }

  if (variant === "detail") {
    return (
      <>
        <button
          type="button"
          onClick={handleToggle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[#4F4035] transition ${className ?? ""}`}
          aria-label={saved ? "Remove listing from saved spaces" : "Save listing"}
        >
          <Heart
            className={`size-[18px] transition-all duration-200 ease-in-out ${
              saved || hovered ? "fill-[#E53E3E] text-[#E53E3E]" : "text-[#555]"
            } ${pulse ? "scale-125" : "scale-100"}`}
          />
          {saved ? "Saved" : "Save"}
        </button>

        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogContent className="max-w-sm">
            <DialogTitle>Sign in to save spaces</DialogTitle>
            <p className="text-sm text-muted-foreground">Create an account or sign in to keep your favorites in one place.</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLoginOpen(false)}>
                Cancel
              </Button>
              <Button asChild className="btn-primary">
                <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in</Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {toast ? (
          <div className="fixed right-4 bottom-4 z-[70] rounded-full bg-[#1A1410] px-4 py-2 text-xs text-white shadow-lg">
            {toast}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`inline-flex size-11 items-center justify-center rounded-full bg-[rgba(255,255,255,0.85)] backdrop-blur-[4px] transition hover:scale-110 ${className ?? ""}`}
        aria-label={saved ? "Remove listing from saved spaces" : "Save listing"}
      >
        <Heart
          className={`size-[18px] transition-all duration-200 ease-in-out ${
            saved || hovered ? "fill-[#E53E3E] text-[#E53E3E]" : "text-[#555]"
          } ${pulse ? "scale-125" : "scale-100"}`}
        />
      </button>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Sign in to save spaces</DialogTitle>
          <p className="text-sm text-muted-foreground">Create an account or sign in to keep your favorites in one place.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLoginOpen(false)}>
              Cancel
            </Button>
            <Button asChild className="btn-primary">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Log in</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
