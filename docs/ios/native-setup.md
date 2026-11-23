# iOS app: native setup

The website side is done (see the PR that added this file). The iOS app loads usethrml.com in
Capacitor, which exposes the native plugins to the page as `window.Capacitor.Plugins`. The site
calls them when present and falls back to normal web behaviour otherwise, so nothing breaks in an
older build or in a browser.

## 1. Plugins

```
npm i @capacitor/push-notifications @capacitor/camera @capacitor/share @capacitor/app @capacitor/browser
npx cap sync ios
```

The site uses exactly these plugin names: `PushNotifications`, `Camera`, `Share`, `App`, `Browser`.
`Browser` opens Google / Apple sign-in, Stripe onboarding and outside links in a Safari sheet.

## 2. Info.plist

| Key | Value |
|---|---|
| `NSCameraUsageDescription` | thrml uses your camera so you can take a profile photo or photos of your space. |
| `NSPhotoLibraryUsageDescription` | thrml uses your photo library so you can choose a profile photo or photos of your space. |
| `NSPhotoLibraryAddUsageDescription` | thrml saves photos you take for your profile to your library. |
| `NSLocationWhenInUseUsageDescription` | thrml uses your location to show private saunas near you. *(only if the app asks for location)* |

Without the camera key, iOS terminates the app the moment someone picks "Take Photo", which is
the avatar bug.

**URL scheme (for sign-in).** Add a URL type with scheme `com.usethrml.app` (Info → URL Types,
identifier `com.usethrml.app`). Google and Apple sign-in send people back to
`com.usethrml.app://auth/callback?...`; the app's `appUrlOpen` hands that to the site, which closes
the sheet and finishes sign-in. Google blocks sign-in inside the app's own web view, so this is
required for Google sign-in to work in the app at all.

## 2b. capacitor.config

```ts
server: {
  url: "https://usethrml.com",
  errorPath: "offline.html", // shown when the site can't load (no connection at launch)
},
```

Copy `docs/ios/offline.html` into the web assets folder (`webDir`, e.g. `www/offline.html`) so it's
bundled in the app. Once the site is loaded, the site shows the same screen itself when the
connection drops, and hides it when it comes back.

## 3. Capabilities (Xcode → Signing & Capabilities)

- **Push Notifications**
- **Background Modes → Remote notifications** (optional; only needed for silent pushes)
- **Associated Domains**: `applinks:usethrml.com` and `applinks:www.usethrml.com`

In `AppDelegate.swift`, forward the APNs callbacks to Capacitor (the push plugin's README has the
two `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` /
`didFailToRegisterForRemoteNotificationsWithError` snippets). Keep `presentationOptions`
`["badge", "sound", "alert"]` in `capacitor.config` so notifications show while the app is open.

## 4. Privacy manifest

Add `docs/ios/PrivacyInfo.xcprivacy` to the App target (`ios/App/App/`). The app **tracks only
after the person taps Allow** on the tracking prompt: the site then loads the Meta pixel and
Google Ads / GA4 tags, and the server sends Meta Conversions API events with hashed name, email,
phone and account ID. If they decline, none of it loads and iOS blocks the listed domains.

App Store Connect → App Privacy must match: "Data Used to Track You" = name, email, phone, user ID,
device ID and product interaction (third-party advertising). Everything else is "Data Linked to
You" for app functionality.

App icon: `docs/ios/AppIcon-1024.png`: the "thrml" wordmark in cream on ember (same artwork as the site favicon), 1024×1024, no transparency, square corners.

## 5. Supabase redirect URL (needed before the next app build)

Supabase → Authentication → URL Configuration → Redirect URLs: add
`com.usethrml.app://auth/callback**`. Without it Supabase falls back to the site URL and the person
lands on the website in the sheet instead of back in the app.

## 6. Sign in with Apple (after the Apple Developer account is active)

The button is built and hidden. To turn it on:

1. Apple Developer → Identifiers → the app ID → enable **Sign in with Apple**.
2. Create a **Services ID** (e.g. `com.usethrml.web`), enable Sign in with Apple, domain
   `viyabebupdkqrrvxqxsp.supabase.co`, return URL
   `https://viyabebupdkqrrvxqxsp.supabase.co/auth/v1/callback`.
3. Keys → create a key with **Sign in with Apple**; download the `.p8`.
4. Supabase → Authentication → Providers → Apple: Services ID as Client ID, Team ID, Key ID and the
   `.p8` contents. Save.
5. Vercel (Production + Preview): `NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=true`, then redeploy.

## 7. Apple Developer + Vercel

1. Apple Developer → Keys → create a key with **Apple Push Notifications service (APNs)**.
   Download the `.p8` once.
2. On Vercel (Production and Preview):
   - `APNS_KEY_ID`: the key's ID
   - `APNS_TEAM_ID`: your Team ID
   - `APNS_AUTH_KEY`: the full text of the `.p8` file
   - `APNS_BUNDLE_ID`: the app's bundle ID (defaults to `com.usethrml.app`)
   - `APNS_PRODUCTION`: `true` for TestFlight/App Store builds; leave unset for Xcode debug builds
   - `APPLE_APP_IDS`: `<TEAM_ID>.<BUNDLE_ID>` (turns on universal links; redeploy after setting)
3. Check `https://usethrml.com/.well-known/apple-app-site-association` returns JSON.

## What the site does with them

- **Push**: after someone is signed in and has finished onboarding, the app asks once for
  notification permission, then registers the device (`POST /api/push/devices`). Sign-out removes
  the device. Tapping a notification opens its page.
  - Sent automatically, mirroring the emails: new booking and booking requests (host), booking
    confirmed / declined / expired / payment problem (guest), cancellations, 24-hour and 2-hour
    reminders, new reviews, payouts, review requests, and new messages.
  - Marketing (new spaces nearby, tips, offers): `POST /api/admin/push/broadcast` with
    `{ topic, title, body, url, dryRun }`. Only reaches people who opted into that email topic.
  - Everyone can turn phone notifications off (Profile → Notifications → Phone notifications), and
    each type follows the same switch as its email.
- **Camera**: the avatar opens the iOS sheet with Take Photo / Choose from Library.
- **Share sheet**: listing Share and the referral Share open the iOS share sheet with the
  usethrml.com link.
- **Universal links**: usethrml.com links open in the app on the matching page. Sign-in
  callbacks (`/auth/*`), the API and the admin stay in the browser.
- **Sign-in**: Google (and Apple once enabled) opens in a Safari sheet and returns through the
  `com.usethrml.app` scheme. Websites are unchanged.
- **Outside links**: links and pop-ups to other sites (maps, Instagram, Stripe dashboards) open in
  the Safari sheet, so the app never navigates away from usethrml.com. Stripe onboarding and ID
  verification also open there, and the page refreshes when the sheet closes.
- **Offline**: a branded "You're offline" screen when the connection drops; `offline.html` at launch.
- **Report and block** (App Review guideline 1.2): report links on listings and reviews, and a ⋯
  menu in each conversation to report or block the other person. Reports land in /admin/reports
  and email the support inbox; act on them within 24 hours.

## Test checklist

- [ ] Avatar → Take Photo and Choose from Library both upload
- [ ] Sign in → permission prompt appears once → row in `push_devices`
- [ ] Send a message from another account → notification → tap opens the conversation
- [ ] Book a listing → guest gets "Booking confirmed", host gets "New booking"
- [ ] Sign out → the device row is gone
- [ ] Share on a listing → iOS share sheet with `https://usethrml.com/listings/...`
- [ ] Tap a usethrml.com link in Notes or Messages → opens in the app
- [ ] Continue with Google → Safari sheet → pick account → back in the app, signed in
- [ ] Close the Google sheet without signing in → button is usable again
- [ ] Stripe "Set up payouts" → Safari sheet → close it → the page refreshes
- [ ] Tap an outside link (a listing's map, Instagram) → Safari sheet, app stays put
- [ ] Airplane mode → "You're offline" screen; turn it off → "Back online"
- [ ] Launch in airplane mode → bundled offline page; Try again after reconnecting → site loads
- [ ] Report a listing and a review; block someone in Messages → can't message each other
