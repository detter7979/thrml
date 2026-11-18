export type AppIntent = "guest" | "host" | "both"

/** Where a new account lands once email is confirmed. */
export function postSignupPath(intent: AppIntent, requestedNext: string | null): string {
  if (requestedNext) return requestedNext
  if (intent === "host") return "/become-a-host"
  return "/explore"
}

export function showAppTabBar(pathname: string): boolean {
  if (pathname.startsWith("/book")) return false
  if (pathname.startsWith("/admin")) return false
  // Listing pages keep their own reserve bar along the bottom.
  if (pathname.startsWith("/listing/")) return false
  return true
}

export type AppTabId = "explore" | "dashboard" | "activity" | "wishlists" | "profile"

export function activityTab(isHost: boolean): { href: string; label: string } {
  return isHost
    ? { href: "/dashboard/listings", label: "Listings" }
    : { href: "/dashboard/bookings", label: "Bookings" }
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
  if (id === "dashboard") {
    if (pathname === "/dashboard") return true
    if (!pathname.startsWith("/dashboard/")) return false
    return !(
      isAppTabActive(pathname, "activity") ||
      isAppTabActive(pathname, "wishlists") ||
      isAppTabActive(pathname, "profile")
    )
  }
  if (id === "activity") {
    return (
      pathname.startsWith("/dashboard/bookings") ||
      pathname.startsWith("/dashboard/listings") ||
      pathname.startsWith("/dashboard/host")
    )
  }
  if (id === "wishlists") return pathname.startsWith("/dashboard/saved")
  if (id === "profile") {
    return (
      pathname.startsWith("/dashboard/account") ||
      pathname.startsWith("/dashboard/profile") ||
      pathname.startsWith("/settings")
    )
  }
  return false
}
