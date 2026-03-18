import type { Metadata } from "next"

import SignupClientPage from "./signup-client"

export const metadata: Metadata = {
  title: "Create Account",
  description: "Join thrml to book private saunas, cold plunges, and wellness spaces near you.",
  robots: { index: false, follow: false },
}

export default function SignupPage() {
  return <SignupClientPage />
}
