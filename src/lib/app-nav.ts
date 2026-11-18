export type AppIntent = "guest" | "host" | "both"
export type AppMode = "booking" | "hosting"

const MODE_KEY = "thrml.appMode"
const ONBOARDING_KEY = "thrml.onboarding.v1"
export const APP_MODE_EVENT = "thrml:app-mode"

/** Where a new account lands once email is confirmed. */
export function postSignupPath(intent: AppIntent, requestedNext: string | null): string {
  if (requestedNext) return requestedNext
  if (intent === "host") return "/become-a-host"
  return "/explore"
}

export function modeForIntent(intent: AppIntent): AppMode {
  return intent === "host" ? "hosting" : "booking"
}

export function showAppTabBar(pathname: string): boolean {
  if (pathname.startsWith("/book")) return false
  if (pathname.startsWith("/admin")) return false
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/auth")) return false
  // Listing pages keep their own reserve bar along the bottom.
  if (pathname.startsWith("/listing/")) return false
  return true
}

export type AppTabId = "explore" | "today" | "wishlists" | "bookings" | "listings" | "inbox" | "profile"

export function tabsForMode(mode: AppMode): Array<{ id: AppTabId; href: string; label: string }> {
  if (mode === "hosting") {
    return [
      { id: "today", href: "/dashboard", label: "Today" },
      { id: "listings", href: "/dashboard/listings", label: "Listings" },
      { id: "bookings", href: "/dashboard/bookings", label: "Bookings" },
      { id: "inbox", href: "/dashboard/messages", label: "Inbox" },
      { id: "profile", href: "/dashboard/account", label: "Profile" },
    ]
  }
  return [
    { id: "explore", href: "/explore", label: "Explore" },
    { id: "wishlists", href: "/dashboard/saved", label: "Wishlists" },
    { id: "bookings", href: "/dashboard/bookings", label: "Bookings" },
    { id: "inbox", href: "/dashboard/messages", label: "Inbox" },
    { id: "profile", href: "/dashboard/account", label: "Profile" },
  ]
}

export function isAppTabActive(pathname: string, id: AppTabId): boolean {
  if (id === "explore") {
    return (
      pathname === "/" ||
      pathname === "/explore" ||
      pathname.startsWith("/explore/") ||
      pathname.startsWith("/listing/") ||
      pathname.startsWith("/listings/")
    )
  }
  if (id === "today") return pathname === "/dashboard"
  if (id === "inbox") {
    return pathname === "/dashboard/messages" || pathname.startsWith("/dashboard/messages/")
  }
  if (id === "listings") {
    if (pathname.startsWith("/dashboard/host/templates")) return false
    return pathname.startsWith("/dashboard/listings") || pathname.startsWith("/dashboard/host")
  }
  if (id === "bookings") return pathname.startsWith("/dashboard/bookings")
  if (id === "wishlists") return pathname.startsWith("/dashboard/saved")
  if (id === "profile") {
    return (
      pathname.startsWith("/dashboard/account") ||
      pathname.startsWith("/dashboard/profile") ||
      pathname.startsWith("/dashboard/earnings") ||
      pathname.startsWith("/dashboard/host/templates") ||
      pathname.startsWith("/settings")
    )
  }
  return false
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  }).Capacitor
  if (typeof cap?.isNativePlatform === "function" && cap.isNativePlatform()) return true
  if (typeof cap?.getPlatform === "function" && cap.getPlatform() !== "web") return true
  return /Capacitor/i.test(window.navigator.userAgent)
}

export function onboardingComplete(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "1"
  } catch {
    return true
  }
}

export function markOnboardingComplete() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1")
  } catch {
    // The tour can show again next launch if storage is blocked.
  }
}

export function readAppMode(canHost: boolean): AppMode {
  if (!canHost) return "booking"
  try {
    const saved = window.localStorage.getItem(MODE_KEY)
    if (saved === "hosting" || saved === "booking") return saved
  } catch {
    // Fall through to the host default.
  }
  return "hosting"
}

export function writeAppMode(mode: AppMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    // The tab bar still updates for this page view.
  }
  window.dispatchEvent(new Event(APP_MODE_EVENT))
}
