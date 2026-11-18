"use client"

import { useState } from "react"

import { createClient } from "@/lib/supabase/client"

const PROFILE_NAME_OVERRIDE_KEY = "thrml.profileNameOverride"

export function SignOutButton() {
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    try {
      localStorage.removeItem(PROFILE_NAME_OVERRIDE_KEY)
    } catch {
      // Ignore storage failures during sign out.
    }
    window.location.assign("/")
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-full border border-[#E7DED3] bg-white text-sm font-medium text-[#1A1410] disabled:opacity-60"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  )
}
