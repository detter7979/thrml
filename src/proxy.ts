import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

function isProtectedPath(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/book") || pathname.startsWith("/review")
}

export async function proxy(request: NextRequest) {
  // Supabase sends people to the Site URL (/?code=…) when our redirect URL isn't on its allowlist.
  // Hand that code to /auth/callback so the session is set server-side and the saved return path is used.
  if (request.nextUrl.pathname === "/") {
    if (!request.nextUrl.searchParams.has("code")) return NextResponse.next()
    const callback = request.nextUrl.clone()
    callback.pathname = "/auth/callback"
    return NextResponse.redirect(callback)
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((cookie) => request.cookies.set(cookie.name, cookie.value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone()
    const nextPathWithSearch = `${request.nextUrl.pathname}${request.nextUrl.search}`
    redirectUrl.pathname = "/login"
    redirectUrl.search = ""
    redirectUrl.searchParams.set("next", nextPathWithSearch)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/book/:path*", "/review/:path*"],
}
