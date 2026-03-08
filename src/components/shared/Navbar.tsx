"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"

const PROFILE_NAME_OVERRIDE_KEY = "thrml.profileNameOverride"

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const [scrolled, setScrolled] = useState(() => !isHome)
  const [userName, setUserName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [hostingEnabled, setHostingEnabled] = useState(false)

  function normalizeAvatarUrl(value: unknown) {
    return typeof value === "string" && value.trim().length > 0 ? value : null
  }

  function normalizeName(value: unknown) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
  }

  function getProfileNameOverride() {
    try {
      return normalizeName(localStorage.getItem(PROFILE_NAME_OVERRIDE_KEY))
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!isHome) return

    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [isHome])

  useEffect(() => {
    const load = async () => {
      const profileNameOverride = getProfileNameOverride()
      if (profileNameOverride) {
        setUserName(profileNameOverride)
      }
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoggedIn(false)
        return
      }
      setLoggedIn(true)
      const fallbackName = normalizeName(user.user_metadata.full_name) ?? user.email ?? "Member"
      const { data: profileById } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, ui_intent")
        .eq("id", user.id)
        .maybeSingle()
      const { data: profileByUserId, error: profileByUserIdError } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, ui_intent")
        .eq("user_id", user.id)
        .maybeSingle()
      const isMissingUserIdColumn = Boolean(profileByUserIdError?.message?.includes("column profiles.user_id does not exist"))
      const legacyProfile = isMissingUserIdColumn ? null : profileByUserId
      const profile = profileById
        ? {
            ...legacyProfile,
            ...profileById,
            full_name: normalizeName(profileById.full_name) ?? normalizeName(legacyProfile?.full_name),
            avatar_url: normalizeAvatarUrl(profileById.avatar_url) ?? normalizeAvatarUrl(legacyProfile?.avatar_url),
            ui_intent: profileById.ui_intent ?? legacyProfile?.ui_intent ?? null,
          }
        : legacyProfile
      setUserName(profileNameOverride ?? profile?.full_name ?? fallbackName)
      setAvatarUrl(normalizeAvatarUrl(profile?.avatar_url))
      const { count: listingCount } = await supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("host_id", user.id)
      setHostingEnabled(
        Boolean((listingCount ?? 0) > 0) ||
          profile?.ui_intent === "host" ||
          profile?.ui_intent === "both"
      )

      const refreshUnread = async () => {
        const res = await fetch("/api/conversations")
        if (!res.ok) return
        const payload = (await res.json()) as { conversations?: Array<{ unread_count?: number }> }
        const next = (payload.conversations ?? []).reduce((sum, item) => sum + Number(item.unread_count ?? 0), 0)
        setUnreadCount(next)
      }
      await refreshUnread()

      const messagesChannel = supabase
        .channel(`navbar-messages-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
          void refreshUnread()
        })
        .subscribe()

      const conversationsChannel = supabase
        .channel(`navbar-conversations-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
          void refreshUnread()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(messagesChannel)
        supabase.removeChannel(conversationsChannel)
      }
    }
    let cleanup: (() => void) | undefined
    void load().then((maybeCleanup) => {
      cleanup = maybeCleanup
    })
    return () => cleanup?.()
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
        setUserName(normalizedFullName)
      }
      if (typeof nextAvatarUrl === "string" && nextAvatarUrl.trim().length > 0) {
        setAvatarUrl(nextAvatarUrl.trim())
      }
    }

    window.addEventListener("app:profile-updated", handleProfileUpdate)
    return () => window.removeEventListener("app:profile-updated", handleProfileUpdate)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    try {
      localStorage.removeItem(PROFILE_NAME_OVERRIDE_KEY)
    } catch {
      // Ignore storage failures during sign out.
    }
    setLoggedIn(false)
    setUserName(null)
    setAvatarUrl(null)
    setHostingEnabled(false)
    window.location.assign("/")
  }

  const homeTransparent = isHome && !scrolled
  const desktopLinkColor = homeTransparent ? "text-[#F5EFE8]" : "text-[#1A1410]"
  const initials = (userName ?? "M")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header
      className={`top-0 z-50 w-full transition-all duration-300 ${
        isHome ? "fixed" : "sticky"
      } ${
        homeTransparent
          ? "bg-transparent"
          : "bg-white/96 shadow-[0_8px_24px_rgba(26,20,16,0.08)] backdrop-blur"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className={`font-serif text-3xl lowercase tracking-tight ${desktopLinkColor}`}>
          thrml
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {loggedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-current/20 px-2 py-1">
                  <Avatar size="sm">
                    <AvatarImage src={avatarUrl ?? undefined} alt={userName ?? "Member"} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className={`text-sm ${desktopLinkColor}`}>{userName?.split(" ")[0] ?? "Account"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-40">
                <DropdownMenuLabel>{userName ?? "Member"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/bookings">My Bookings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/messages" className="flex items-center justify-between gap-2">
                    Messages
                    {unreadCount > 0 ? (
                      unreadCount > 9 ? (
                        <span className="rounded-full bg-[#C93C3C] px-1.5 py-0.5 text-[10px] text-white">9+</span>
                      ) : (
                        <span className="size-2 rounded-full bg-[#C93C3C]" />
                      )
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/saved">Saved Spaces</Link>
                </DropdownMenuItem>
                {hostingEnabled ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Hosting</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/listings">My Listings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/earnings">Earnings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="text-[#C75B3A]">
                      <Link href="/dashboard/listings/new">List a new space</Link>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem asChild className="text-[#C75B3A]">
                    <Link href="/dashboard/listings/new">Start hosting</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/account">Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className={`rounded-full border border-current/25 px-5 hover:bg-white/10 ${desktopLinkColor}`}
              >
                <Link href="/dashboard/listings/new">List your space</Link>
              </Button>
              <Link href="/login" className={`text-sm ${desktopLinkColor}`}>
                Log in
              </Link>
              <Button asChild className="rounded-full bg-[#C75B3A] px-5 text-white hover:bg-[#B45033]">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </nav>

        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                suppressHydrationWarning
                className={`inline-flex items-center justify-center rounded-full p-2 ${
                  homeTransparent ? "text-[#F5EFE8]" : "text-[#1A1410]"
                }`}
              >
                <Menu className="size-6" />
                <span className="sr-only">Open navigation</span>
              </button>
            </SheetTrigger>
            <SheetContent side="top" className="h-svh border-0 bg-[#1A1410] text-[#F5EFE8]">
              <SheetHeader>
                <SheetTitle className="font-serif text-4xl lowercase text-[#F5EFE8]">thrml</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-4 py-6 text-lg">
                <Link href="/explore">Explore</Link>
                {loggedIn ? (
                  <>
                    <Link href="/dashboard">Overview</Link>
                    <Link href="/dashboard/bookings">My bookings</Link>
                    <Link href="/dashboard/messages" className="flex items-center gap-2">
                      Messages
                      {unreadCount > 0 ? (
                        unreadCount > 9 ? (
                          <span className="rounded-full bg-[#C93C3C] px-1.5 py-0.5 text-[10px] text-white">9+</span>
                        ) : (
                          <span className="size-2 rounded-full bg-[#C93C3C]" />
                        )
                      ) : null}
                    </Link>
                    <Link href="/dashboard/listings">My listings</Link>
                    <Link href="/dashboard/earnings">Earnings</Link>
                    <Link href="/dashboard/listings/new" className="text-[#FFAB90]">
                      List a new space
                    </Link>
                    <button type="button" className="text-left" onClick={handleSignOut}>
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/dashboard/bookings">Your rituals</Link>
                    <Link href="/dashboard/listings/new">List your space</Link>
                    <Link href="/login">Log in</Link>
                    <Button asChild className="mt-2 rounded-full bg-[#C75B3A] text-white hover:bg-[#B45033]">
                      <Link href="/signup">Sign up</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
