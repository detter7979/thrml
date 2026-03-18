import type { Metadata } from "next"

import LoginClientPage from "./login-client"

export const metadata: Metadata = {
  title: "Log In",
  description: "Sign in to your thrml account to manage bookings, messages, and your wellness spaces.",
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginClientPage />
}
