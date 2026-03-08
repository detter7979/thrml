"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Heart, Home, Landmark, MessageCircle, PlusCircle, Search, Settings, Sparkles, User } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type UiIntent = "guest" | "host" | "both"
const PROFILE_NAME_OVERRIDE_KEY = "thrml.profileNameOverride"

export function DashboardShell({
  fullName,
  avatarUrl,
  uiIntent,
  hasListings,
  children,
}: {
  fullName: string
  avatarUrl: string | null
  uiIntent: UiIntent
  hasListings: boolean
  children: ReactNode
}) {
  const pathname = usePathname()
  const [fullNameValue, setFullNameValue] = useState(fullName)
  const [avatarUrlValue, setAvatarUrlValue] = useState(avatarUrl)
  const [savedCount, setSavedCount] = useState(0)
  const [upcomingBookingsCount, setUpcomingBookingsCount] = useState(0)
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0)
  const hostingEnabled = hasListings || uiIntent === "host" || uiIntent === "both"
  const normalizeName = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null)
  const getProfileNameOverride = () => {
    try {
      return normalizeName(localStorage.getItem(PROFILE_NAME_OVERRIDE_KEY))
    } catch {
      return null
    }
  }
  const isNavItemActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`)
  const baseItems = [
    { href: "/dashboard", label: "Overview", icon: Home },
    { href: "/dashboard/bookings", label: "My Bookings", icon: CalendarDays },
    { href: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { href: "/dashboard/saved", label: "Saved Spaces", icon: Heart },
    { href: "/dashboard/account", label: "Account", icon: Settings },
  ]
  const hostingItems = [
    { href: "/dashboard/profile", label: "Profile", icon: Home },
    { href: "/dashboard/listings", label: "My Listings", icon: Sparkles },
    { href: "/dashboard/earnings", label: "Earnings", icon: Landmark },
    { href: "/dashboard/host/templates", label: "Message Templates", icon: MessageCircle },
  ]
  const mobileItems = hostingEnabled
    ? [
        { href: "/explore", label: "Explore", icon: Search },
        { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
        { href: "/dashboard/messages", label: "Messages", icon: MessageCircle },
        { href: "/dashboard", label: "Dashboard", icon: Home },
        { href: "/dashboard/account", label: "Account", icon: User },
      ]
    : [
        { href: "/", label: "Home", icon: Home },
        { href: "/explore", label: "Explore", icon: Search },
        { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays },
        { href: "/dashboard/messages", label: "Messages", icon: MessageCircle },
        { href: "/dashboard/account", label: "Account", icon: User },
      ]

  const initials = fullNameValue
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    const profileNameOverride = getProfileNameOverride()
    setFullNameValue(profileNameOverride ?? fullName)
  }, [fullName])

  useEffect(() => {
    setAvatarUrlValue(avatarUrl)
  }, [avatarUrl])

  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ avatarUrl?: unknown }>
      const nextAvatarUrl = customEvent.detail?.avatarUrl
      if (typeof nextAvatarUrl === "string" && nextAvatarUrl.length > 0) {
        setAvatarUrlValue(nextAvatarUrl)
      }
    }
    window.addEventListener("dashboard:avatar-updated", handleAvatarUpdate)
    return () => window.removeEventListener("dashboard:avatar-updated", handleAvatarUpdate)
  }, [])

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ fullName?: unknown; avatarUrl?: unknown }>
      const nextFullName = customEvent.detail?.fullName
      const nextAvatarUrl = customEvent.detail?.avatarUrl
      if (typeof nextFullName === "string" && nextFullName.trim().length > 0) {
        const normalizedFullName = nextFullName.trim()
        try {
          localStorage.setItem(PROFILE_NAME_OVERRIDE_KEY, normalizedFullName)
        } catch {
          // Ignore storage failures and continue event syncing.
        }
        setFullNameValue(normalizedFullName)
      }
      if (typeof nextAvatarUrl === "string" && nextAvatarUrl.length > 0) {
        setAvatarUrlValue(nextAvatarUrl)
      }
    }

    window.addEventListener("dashboard:profile-updated", handleProfileUpdate)
    window.addEventListener("app:profile-updated", handleProfileUpdate)
    return () => {
      window.removeEventListener("dashboard:profile-updated", handleProfileUpdate)
      window.removeEventListener("app:profile-updated", handleProfileUpdate)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    const refreshSavedCount = async () => {
      const response = await fetch("/api/saved")
      if (!mounted) return
      if (!response.ok) {
        setSavedCount(0)
        return
      }
      const payload = (await response.json()) as { saved?: unknown[] }
      if (!mounted) return
      setSavedCount(Array.isArray(payload.saved) ? payload.saved.length : 0)
    }

    const refreshUpcomingBookingsCount = async (userId: string) => {
      const today = new Date()
      const localDateIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("guest_id", userId)
        .in("status", ["confirmed", "pending", "pending_host"])
        .gte("session_date", localDateIso)
      if (!mounted) return
      setUpcomingBookingsCount(Number(count ?? 0))
    }

    const getConversationIdsForUser = async (userId: string) => {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
      return ((data ?? []) as Array<{ id: string | null }>).map((row) => row.id).filter(Boolean) as string[]
    }

    const refreshUnreadMessagesCount = async (userId: string, conversationIds?: string[]) => {
      const scopedConversationIds = conversationIds ?? (await getConversationIdsForUser(userId))
      if (!mounted) return
      if (!scopedConversationIds.length) {
        setUnreadMessagesCount(0)
        return
      }

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", scopedConversationIds)
        .neq("sender_id", userId)
        .is("read_at", null)

      if (!mounted) return
      setUnreadMessagesCount(Number(count ?? 0))
    }

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!mounted || !user?.id) return

      const conversationIds = await getConversationIdsForUser(user.id)

      await Promise.all([
        refreshSavedCount(),
        refreshUpcomingBookingsCount(user.id),
        refreshUnreadMessagesCount(user.id, conversationIds),
      ])

      const savedChannel = supabase
        .channel(`dashboard-saved-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "saved_listings",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void refreshSavedCount()
          }
        )
        .subscribe()

      const bookingsChannel = supabase
        .channel(`dashboard-bookings-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
            filter: `guest_id=eq.${user.id}`,
          },
          () => {
            void refreshUpcomingBookingsCount(user.id)
          }
        )
        .subscribe()

      let currentConversationIds = conversationIds
      let messageChannels = currentConversationIds.map((conversationId) =>
        supabase
          .channel(`dashboard-messages-${user.id}-${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            () => {
              void refreshUnreadMessagesCount(user.id, currentConversationIds)
            }
          )
          .subscribe()
      )

      const rebuildMessageChannels = (nextConversationIds: string[]) => {
        for (const channel of messageChannels) {
          supabase.removeChannel(channel)
        }
        currentConversationIds = nextConversationIds
        messageChannels = currentConversationIds.map((conversationId) =>
          supabase
            .channel(`dashboard-messages-${user.id}-${conversationId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "messages",
                filter: `conversation_id=eq.${conversationId}`,
              },
              () => {
                void refreshUnreadMessagesCount(user.id, currentConversationIds)
              }
            )
            .subscribe()
        )
      }

      const conversationsChannel = supabase
        .channel(`dashboard-conversations-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `guest_id=eq.${user.id}`,
          },
          async () => {
            const nextConversationIds = await getConversationIdsForUser(user.id)
            rebuildMessageChannels(nextConversationIds)
            await refreshUnreadMessagesCount(user.id, nextConversationIds)
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `host_id=eq.${user.id}`,
          },
          async () => {
            const nextConversationIds = await getConversationIdsForUser(user.id)
            rebuildMessageChannels(nextConversationIds)
            await refreshUnreadMessagesCount(user.id, nextConversationIds)
          }
        )
        .subscribe()

      const handleUnreadDecrement = (event: Event) => {
        const customEvent = event as CustomEvent<{ amount?: unknown }>
        const amountRaw = customEvent.detail?.amount
        const amount =
          typeof amountRaw === "number" && Number.isFinite(amountRaw)
            ? Math.max(0, Math.floor(amountRaw))
            : 0
        if (!amount) return
        setUnreadMessagesCount((prev) => Math.max(0, prev - amount))
      }

      window.addEventListener("dashboard:messages-unread-decrement", handleUnreadDecrement)

      return () => {
        window.removeEventListener("dashboard:messages-unread-decrement", handleUnreadDecrement)
        supabase.removeChannel(savedChannel)
        supabase.removeChannel(bookingsChannel)
        supabase.removeChannel(conversationsChannel)
        for (const channel of messageChannels) {
          supabase.removeChannel(channel)
        }
      }
    }

    let cleanup: (() => void) | undefined
    void load().then((maybeCleanup) => {
      cleanup = maybeCleanup
    })

    return () => {
      mounted = false
      cleanup?.()
    }
  }, [])

  return (
    <div className="min-h-[100svh] bg-[#F7F3EE] md:grid md:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-[#E7DED3] bg-white md:flex md:flex-col">
        <div className="space-y-4 border-b border-[#F1E7DC] p-5">
          <Link href="/" className="mb-4 block font-serif text-3xl lowercase text-[#1A1410]">
            thrml
          </Link>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={avatarUrlValue ?? undefined} alt={fullNameValue} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <p className="text-sm font-medium text-[#1A1410]">{fullNameValue}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {baseItems.map((item) => {
            const Icon = item.icon
            const active = isNavItemActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                  active ? "bg-[#FFF2EA] text-[#C75B3A]" : "text-[#5D4E42] hover:bg-[#F8F3ED]"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {item.label}
                </span>
                {item.href === "/dashboard/saved" && savedCount > 0 ? (
                  <span className="rounded-full bg-[#F3E8DE] px-1.5 py-0.5 text-[10px] font-medium text-[#8B4E39]">
                    {savedCount > 99 ? "99+" : savedCount}
                  </span>
                ) : null}
                {item.href === "/dashboard/bookings" && upcomingBookingsCount > 0 ? (
                  <span className="rounded-full bg-[#F3E8DE] px-1.5 py-0.5 text-[10px] font-medium text-[#8B4E39]">
                    {upcomingBookingsCount > 99 ? "99+" : upcomingBookingsCount}
                  </span>
                ) : null}
                {item.href === "/dashboard/messages" && unreadMessagesCount > 0 ? (
                  <span className="rounded-full bg-[#F3E8DE] px-1.5 py-0.5 text-[10px] font-medium text-[#8B4E39]">
                    {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
          {hostingEnabled ? (
            <div className="mt-4 space-y-1">
              <p className="px-3 pb-1 text-[11px] uppercase tracking-wide text-[#9B8B7E]">Hosting</p>
              {hostingItems.map((item) => {
                const Icon = item.icon
                const active = isNavItemActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                      active ? "bg-[#FFF2EA] text-[#C75B3A]" : "text-[#5D4E42] hover:bg-[#F8F3ED]"
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="mx-2 mt-4 rounded-xl bg-[#FCF7F1] p-3 text-xs text-[#766759]">
              <p className="font-medium text-[#5D4E42]">Thinking about hosting?</p>
              <p className="mt-1">Create a space when you&apos;re ready. We&apos;ll unlock hosting tools automatically.</p>
            </div>
          )}
        </nav>

        <div className="px-4 pb-1">
          <div className="mb-3 border-t border-[#EEE4D9] pt-3">
            <div className="space-y-1">
              <Link
                href="/explore"
                className="block text-sm text-[#6D5E51] transition hover:text-[#2C2420]"
              >
                ← Back to explore
              </Link>
              <Link
                href="/"
                className="block text-sm text-[#6D5E51] transition hover:text-[#2C2420]"
              >
                🏠 Home
              </Link>
            </div>
          </div>
        </div>

        <div className="p-4 pt-2">
          <Button asChild className="h-11 w-full rounded-full bg-[#C75B3A] text-white hover:bg-[#B44D31]">
            <Link href="/dashboard/listings/new">
              <PlusCircle className="mr-2 size-4" />
              {hostingEnabled ? "List a new space" : "Start hosting"}
            </Link>
          </Button>
        </div>
      </aside>

      <div className="sticky top-0 z-50 border-b border-[#E7DED3] bg-white md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="font-serif text-2xl lowercase text-[#1A1410]">
            thrml
          </Link>
          <Link
            href="/explore"
            className="text-sm font-medium text-[#8B4513]"
          >
            Explore →
          </Link>
        </div>
      </div>

      <main className="pb-24 md:pb-0">{children}</main>

      <nav
        className="fixed right-0 bottom-0 left-0 z-50 border-t border-[#E5DDD6] bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-16">
        {mobileItems.map((item) => {
          const Icon = item.icon
          const active = isNavItemActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium",
                active ? "text-[#8B4513]" : "text-[#9CA3AF]"
              )}
            >
              <div className="relative">
                <Icon className="size-6" />
                {item.href === "/dashboard/messages" && unreadMessagesCount > 0 ? (
                  <span className="absolute -top-2 -right-2 rounded-full bg-[#C75B3A] px-1 text-[9px] leading-4 text-white">
                    {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
                  </span>
                ) : null}
              </div>
              {item.label}
            </Link>
          )
        })}
        </div>
      </nav>
    </div>
  )
}
