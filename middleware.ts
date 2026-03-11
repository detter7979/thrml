import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/webhooks/stripe")) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res: response })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/api/bookings") ||
    request.nextUrl.pathname.startsWith("/api/messages") ||
    request.nextUrl.pathname.startsWith("/api/listings/create") ||
    request.nextUrl.pathname.startsWith("/api/listings/update") ||
    request.nextUrl.pathname.startsWith("/api/listings/delete")

  if (isProtectedRoute && !session) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
}
