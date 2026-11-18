# iOS app: native setup

The website side is done (see the PR that added this file). The iOS app loads usethrml.com in
Capacitor, which exposes the native plugins to the page as `window.Capacitor.Plugins`. The site
calls them when present and falls back to normal web behaviour otherwise, so nothing breaks in an
older build or in a browser.

## 1. Plugins

```
npm i @capacitor/push-notifications @capacitor/camera @capacitor/share @capacitor/app
npx cap sync ios
```

The site uses exactly these plugin names: `PushNotifications`, `Camera`, `Share`, `App`.

## 2. Info.plist

| Key | Value |
|---|---|
| `NSCameraUsageDescription` | thrml uses your camera so you can take a profile photo or photos of your space. |
| `NSPhotoLibraryUsageDescription` | thrml uses your photo library so you can choose a profile photo or photos of your space. |
| `NSPhotoLibraryAddUsageDescription` | thrml saves photos you take for your profile to your library. |
| `NSLocationWhenInUseUsageDescription` | thrml uses your location to show private saunas near you. *(only if the app asks for location)* |

Without the camera key, iOS terminates the app the moment someone picks "Take Photo", which is
the avatar bug.

## 3. Capabilities (Xcode → Signing & Capabilities)

- **Push Notifications**
- **Background Modes → Remote notifications** (optional; only needed for silent pushes)
- **Associated Domains**: `applinks:usethrml.com` and `applinks:www.usethrml.com`

In `AppDelegate.swift`, forward the APNs callbacks to Capacitor (the push plugin's README has the
two `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` /
`didFailToRegisterForRemoteNotificationsWithError` snippets). Keep `presentationOptions`
`["badge", "sound", "alert"]` in `capacitor.config` so notifications show while the app is open.

## 4. Privacy manifest

Add `docs/ios/PrivacyInfo.xcprivacy` to the App target (`ios/App/App/`). It assumes the app
does **not** track: no Meta pixel or Google Ads cookies inside the app. If that changes, set
`NSPrivacyTracking` to true, list the tracking domains, and add the App Tracking Transparency
prompt. The answers must match App Store Connect → App Privacy.

## 5. Apple Developer + Vercel

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

## Test checklist

- [ ] Avatar → Take Photo and Choose from Library both upload
- [ ] Sign in → permission prompt appears once → row in `push_devices`
- [ ] Send a message from another account → notification → tap opens the conversation
- [ ] Book a listing → guest gets "Booking confirmed", host gets "New booking"
- [ ] Sign out → the device row is gone
- [ ] Share on a listing → iOS share sheet with `https://usethrml.com/listings/...`
- [ ] Tap a usethrml.com link in Notes or Messages → opens in the app
