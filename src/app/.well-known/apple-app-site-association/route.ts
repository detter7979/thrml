import { NextResponse } from "next/server"

/**
 * Universal links: lets usethrml.com links open in the iOS app instead of Safari.
 * Set APPLE_APP_IDS on Vercel to "<TEAM_ID>.<BUNDLE_ID>" (comma-separate several builds), and add
 * the Associated Domains entitlement "applinks:usethrml.com" in Xcode. Until the variable is set
 * this returns 404, so nothing changes for the website.
 *
 * Sign-in callbacks, payments, the admin and the API stay in the browser on purpose.
 */
export const dynamic = "force-static"

export function GET() {
  const appIDs = (process.env.APPLE_APP_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  if (appIDs.length === 0) return new NextResponse("Not found", { status: 404 })

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs,
            components: [
              { "/": "/api/*", exclude: true },
              { "/": "/auth/*", exclude: true },
              { "/": "/admin/*", exclude: true },
              { "/": "/.well-known/*", exclude: true },
              { "/": "/*" },
            ],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  )
}
