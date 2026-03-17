"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"

import { AvatarUpload } from "@/components/profile/AvatarUpload"
import { StripeConnectBanner } from "@/components/host/StripeConnectBanner"
import { Button } from "@/components/ui/button"
import { trackMetaEvent } from "@/components/meta-pixel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { buildFullName, splitFullName } from "@/lib/name-utils"
import type { NotificationPreferenceKey, NotificationPreferences } from "@/lib/notification-preferences"
import { createClient } from "@/lib/supabase/client"

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10)
  if (!digits) return ""
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function normalizeAvatarUrl(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function hasAnyMarketingOptIn(preferences: NotificationPreferences) {
  return Boolean(
    preferences.marketing_wellness_tips ||
      preferences.marketing_offers ||
      preferences.marketing_product_updates
  )
}

const PROFILE_NAME_OVERRIDE_KEY = "thrml.profileNameOverride"

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return null
  }
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function formatNonJsonApiError(status: number) {
  if (status === 401 || status === 403) {
    return "Your session may have expired. Refresh the page and sign in again."
  }
  if (status === 404) {
    return "House rules endpoint was not found. Check that the latest app version is deployed."
  }
  if (status >= 500) {
    return "Server returned an unexpected response. Please try again in a moment."
  }
  return "Received an unexpected response while saving house rules."
}

export function AccountClient({
  userId,
  fullName,
  firstName: propFirstName,
  lastName: propLastName,
  email,
  avatarUrl,
  phone,
  phoneVerified,
  bio,
  houseRules,
  stripeAccountId,
  stripeOnboardingComplete,
  stripePayoutsEnabled,
  stripeChargesEnabled,
  hostingEnabled,
  notificationPreferences,
}: {
  userId: string
  fullName: string
  firstName?: string | null
  lastName?: string | null
  email: string
  avatarUrl: string | null
  phone: string | null
  phoneVerified: boolean
  bio: string | null
  houseRules: string[]
  stripeAccountId: string | null
  stripeOnboardingComplete: boolean
  stripePayoutsEnabled: boolean
  stripeChargesEnabled: boolean
  hostingEnabled: boolean
  notificationPreferences: NotificationPreferences
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const splitFromFullName = useMemo(() => splitFullName(fullName), [fullName])
  const [name, setName] = useState(fullName)
  const [savedName, setSavedName] = useState(fullName)
  const [firstName, setFirstName] = useState(
    propFirstName?.trim() || splitFromFullName.firstName || ""
  )
  const [lastName, setLastName] = useState(
    propLastName?.trim() || splitFromFullName.lastName || ""
  )
  const [avatarUrlValue, setAvatarUrlValue] = useState<string | null>(avatarUrl)
  const [phoneValue, setPhoneValue] = useState(formatPhoneNumber(phone ?? ""))
  const [savedPhone, setSavedPhone] = useState(formatPhoneNumber(phone ?? ""))
  const [bioValue, setBioValue] = useState(bio ?? "")
  const [savedBio, setSavedBio] = useState(bio ?? "")
  const [houseRulesText, setHouseRulesText] = useState((houseRules ?? []).join("\n"))
  const [savedHouseRulesText, setSavedHouseRulesText] = useState((houseRules ?? []).join("\n"))
  const [savingHouseRules, setSavingHouseRules] = useState(false)
  const [houseRulesMessage, setHouseRulesMessage] = useState<string | null>(null)
  const [houseRulesError, setHouseRulesError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(notificationPreferences)
  const [prefsSaveState, setPrefsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [notificationToast, setNotificationToast] = useState<{ tone: "success" | "error"; message: string } | null>(
    null
  )
  const [connectStatus, setConnectStatus] = useState({
    onboardingComplete: stripeOnboardingComplete,
    payoutsEnabled: stripePayoutsEnabled,
    chargesEnabled: stripeChargesEnabled,
  })
  const [isSyncingStripe, setIsSyncingStripe] = useState(false)
  const [isContinuingStripe, setIsContinuingStripe] = useState(false)
  const [isOpeningDashboard, setIsOpeningDashboard] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null)
  const [emailChangeMessage, setEmailChangeMessage] = useState<string | null>(null)
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false)
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null)
  const [passwordResetNotice, setPasswordResetNotice] = useState<string | null>(null)
  const [passwordResetCooldown, setPasswordResetCooldown] = useState(0)

  useEffect(() => {
    setName(fullName)
    setSavedName(fullName)
    setFirstName(propFirstName?.trim() || splitFromFullName.firstName || "")
    setLastName(propLastName?.trim() || splitFromFullName.lastName || "")
  }, [fullName, propFirstName, propLastName, splitFromFullName.firstName, splitFromFullName.lastName])

  useEffect(() => {
    setAvatarUrlValue(normalizeAvatarUrl(avatarUrl))
  }, [avatarUrl])

  useEffect(() => {
    const formattedPhone = formatPhoneNumber(phone ?? "")
    setPhoneValue(formattedPhone)
    setSavedPhone(formattedPhone)
  }, [phone])

  useEffect(() => {
    setBioValue(bio ?? "")
    setSavedBio(bio ?? "")
  }, [bio])

  useEffect(() => {
    const joinedRules = (houseRules ?? []).join("\n")
    setSavedHouseRulesText((prev) => (joinedRules.trim().length > 0 || prev.trim().length === 0 ? joinedRules : prev))
    setHouseRulesText((prev) => (joinedRules.trim().length > 0 || prev.trim().length === 0 ? joinedRules : prev))
  }, [houseRules])

  useEffect(() => {
    const syncProfileSnapshot = async () => {
      const { data: profileById, error: byIdError } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, avatar_url, phone, bio, house_rules")
        .eq("id", userId)
        .maybeSingle()

      if (byIdError) return

      if (profileById) {
        if (typeof profileById.full_name === "string" && profileById.full_name.trim().length > 0) {
          const nextName = profileById.full_name.trim()
          setSavedName(nextName)
          setName(nextName)
        }
        if (typeof profileById.first_name === "string") {
          setFirstName(profileById.first_name.trim())
        }
        if (typeof profileById.last_name === "string") {
          setLastName(profileById.last_name.trim())
        }
        const nextPhone = typeof profileById.phone === "string" ? formatPhoneNumber(profileById.phone) : ""
        const nextBio = typeof profileById.bio === "string" ? profileById.bio : ""
        const byIdAvatarUrl = normalizeAvatarUrl(profileById.avatar_url)
        const nextHouseRules = Array.isArray(profileById.house_rules)
          ? profileById.house_rules.filter((rule): rule is string => typeof rule === "string")
          : []
        const joinedHouseRules = nextHouseRules.join("\n")
        setSavedPhone(nextPhone)
        setPhoneValue(nextPhone)
        setSavedBio(nextBio)
        setBioValue(nextBio)
        if (byIdAvatarUrl) {
          setAvatarUrlValue(byIdAvatarUrl)
        }
        setSavedHouseRulesText((prev) =>
          joinedHouseRules.trim().length > 0 || prev.trim().length === 0 ? joinedHouseRules : prev
        )
        setHouseRulesText((prev) =>
          joinedHouseRules.trim().length > 0 || prev.trim().length === 0 ? joinedHouseRules : prev
        )
        return
      }

      const { data: profileByUserId, error: byUserIdError } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, avatar_url, phone, bio, house_rules")
        .eq("user_id", userId)
        .maybeSingle()

      const isMissingUserIdColumn = Boolean(byUserIdError?.message?.includes("column profiles.user_id does not exist"))
      if (byUserIdError && !isMissingUserIdColumn) return
      if (!profileByUserId) return

      if (typeof profileByUserId.full_name === "string" && profileByUserId.full_name.trim().length > 0) {
        const nextName = profileByUserId.full_name.trim()
        setSavedName(nextName)
        setName(nextName)
      }
      if (typeof profileByUserId.first_name === "string") {
        setFirstName(profileByUserId.first_name.trim())
      }
      if (typeof profileByUserId.last_name === "string") {
        setLastName(profileByUserId.last_name.trim())
      }
      const nextPhone = typeof profileByUserId.phone === "string" ? formatPhoneNumber(profileByUserId.phone) : ""
      const nextBio = typeof profileByUserId.bio === "string" ? profileByUserId.bio : ""
      const byUserIdAvatarUrl = normalizeAvatarUrl(profileByUserId.avatar_url)
      const nextHouseRules = Array.isArray(profileByUserId.house_rules)
        ? profileByUserId.house_rules.filter((rule): rule is string => typeof rule === "string")
        : []
      const joinedHouseRules = nextHouseRules.join("\n")
      setSavedPhone(nextPhone)
      setPhoneValue(nextPhone)
      setSavedBio(nextBio)
      setBioValue(nextBio)
      if (byUserIdAvatarUrl) {
        setAvatarUrlValue(byUserIdAvatarUrl)
      }
      setSavedHouseRulesText((prev) =>
        joinedHouseRules.trim().length > 0 || prev.trim().length === 0 ? joinedHouseRules : prev
      )
      setHouseRulesText((prev) => (joinedHouseRules.trim().length > 0 || prev.trim().length === 0 ? joinedHouseRules : prev))
    }

    void syncProfileSnapshot()
  }, [supabase, userId])

  async function saveProfile() {
    setSaving(true)
    setMessage(null)
    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const normalizedName = buildFullName(normalizedFirstName, normalizedLastName) || name.trim() || savedName.trim()
    const normalizedPhone = formatPhoneNumber(phoneValue)
    const normalizedBio = bioValue.trim()
    const updates = {
      full_name: normalizedName || "Member",
      first_name: normalizedFirstName || null,
      last_name: normalizedLastName || null,
      phone: normalizedPhone || savedPhone.trim() || null,
      bio: normalizedBio || savedBio.trim() || null,
    }

    const { data: updatedRowsById, error: updateByIdError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("full_name, phone, bio")

    let savedProfile = Array.isArray(updatedRowsById) && updatedRowsById.length > 0 ? updatedRowsById[0] : null
    let updateError = updateByIdError
    let upsertError: { message: string } | null = null

    if (!updateByIdError && !savedProfile) {
      const { data: updatedRowsByUserId, error: updateByUserIdError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", userId)
        .select("full_name, phone, bio")

      const isMissingUserIdColumn = Boolean(updateByUserIdError?.message?.includes("column profiles.user_id does not exist"))
      if (!isMissingUserIdColumn) {
        updateError = updateByUserIdError
        savedProfile =
          Array.isArray(updatedRowsByUserId) && updatedRowsByUserId.length > 0 ? updatedRowsByUserId[0] : null
      }
    }

    if (!updateError && !savedProfile) {
      const { data: upsertedRows, error: upsertFailed } = await supabase
        .from("profiles")
        .upsert({ id: userId, ...updates }, { onConflict: "id" })
        .select("full_name, phone, bio")
      savedProfile = Array.isArray(upsertedRows) && upsertedRows.length > 0 ? upsertedRows[0] : null
      upsertError = upsertFailed
    }

    const resolvedError = updateError ?? upsertError
    if (resolvedError) {
      setSaving(false)
      setMessage(resolvedError.message)
      return
    }

    const resolvedName =
      (savedProfile && typeof savedProfile.full_name === "string" && savedProfile.full_name.trim()) ||
      updates.full_name
    const resolvedPhone = savedProfile && typeof savedProfile.phone === "string" ? formatPhoneNumber(savedProfile.phone) : ""
    const resolvedBio = savedProfile && typeof savedProfile.bio === "string" ? savedProfile.bio : ""

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        full_name: resolvedName,
        first_name: normalizedFirstName || null,
        last_name: normalizedLastName || null,
      },
    })
    if (authUpdateError) {
      console.warn("Failed to sync auth profile metadata", authUpdateError.message)
    }

    setName(resolvedName)
    setSavedName(resolvedName)
    const splitResolvedName = splitFullName(resolvedName)
    setFirstName(normalizedFirstName || splitResolvedName.firstName)
    setLastName(normalizedLastName || splitResolvedName.lastName)
    setPhoneValue(resolvedPhone)
    setSavedPhone(resolvedPhone)
    setBioValue(resolvedBio)
    setSavedBio(resolvedBio)
    window.dispatchEvent(
      new CustomEvent("dashboard:profile-updated", {
        detail: { fullName: resolvedName, avatarUrl: avatarUrlValue ?? undefined },
      })
    )
    window.dispatchEvent(
      new CustomEvent("app:profile-updated", {
        detail: { fullName: resolvedName, avatarUrl: avatarUrlValue ?? undefined },
      })
    )
    setSaving(false)
    setMessage("Saved")
    router.refresh()
  }

  async function saveHouseRules(applyToListings: boolean) {
    const normalizedRules = houseRulesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20)

    setSavingHouseRules(true)
    setHouseRulesError(null)
    setHouseRulesMessage(null)

    try {
      const response = await fetch("/api/host/house-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          houseRules: normalizedRules,
          applyToListings,
        }),
      })

      const payload = await parseJsonResponse<{
        message?: string
        error?: string
        warning?: string
        houseRules?: string[]
      }>(response)
      if (!response.ok) {
        if (!payload) {
          throw new Error(formatNonJsonApiError(response.status))
        }
        throw new Error(payload.error ?? "Unable to save house rules.")
      }
      if (!payload) {
        throw new Error(formatNonJsonApiError(response.status))
      }

      const persistedRules = Array.isArray(payload.houseRules) ? payload.houseRules : normalizedRules
      const persistedText = persistedRules.join("\n")
      setHouseRulesText(persistedText)
      setSavedHouseRulesText(persistedText)
      setHouseRulesMessage(payload.warning ?? payload.message ?? "House rules updated.")
    } catch (error) {
      setHouseRulesError(error instanceof Error ? error.message : "Unable to save house rules.")
    } finally {
      setSavingHouseRules(false)
    }
  }

  useEffect(() => {
    setNotificationPrefs(notificationPreferences)
  }, [notificationPreferences])

  async function updateNotificationPreference(key: NotificationPreferenceKey, checked: boolean) {
    const previous = notificationPrefs
    const next = { ...notificationPrefs, [key]: checked }
    setNotificationPrefs(next)
    setPrefsSaveState("saving")
    setNotificationToast(null)

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_preferences: next,
          // Back-compat mirrors for existing downstream usage during transition.
          newsletter_opted_in: hasAnyMarketingOptIn(next),
          offers_opted_in: next.marketing_offers,
          product_updates_opted_in: next.marketing_product_updates,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save notification preferences.")
      }

      const wasMarketingOptedIn = hasAnyMarketingOptIn(previous)
      const isMarketingOptedIn = hasAnyMarketingOptIn(next)

      if (email && wasMarketingOptedIn !== isMarketingOptedIn) {
        const endpoint = isMarketingOptedIn ? "/api/newsletter/subscribe" : "/api/newsletter/unsubscribe"
        const newsletterResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
        const newsletterPayload = (await newsletterResponse.json().catch(() => null)) as { error?: string } | null
        if (!newsletterResponse.ok) {
          throw new Error(newsletterPayload?.error ?? "Saved preferences, but failed to sync newsletter settings.")
        }
        if (isMarketingOptedIn) {
          trackMetaEvent("Lead", {
            content_name: "newsletter_subscribe",
          })
        }
      }

      setPrefsSaveState("saved")
      setNotificationToast({ tone: "success", message: "Email notification preferences saved." })
      setTimeout(() => setPrefsSaveState("idle"), 1800)
    } catch (error) {
      setNotificationPrefs(previous)
      setPrefsSaveState("error")
      setNotificationToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save notification preferences.",
      })
    }
  }

  async function syncStripeStatus() {
    if (!stripeAccountId) return
    setIsSyncingStripe(true)
    setStripeError(null)
    try {
      const response = await fetch("/api/stripe/connect/status")
      const data = (await response.json()) as {
        onboarding_complete?: boolean
        payouts_enabled?: boolean
        charges_enabled?: boolean
        error?: string
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to refresh Stripe status.")
      }
      setConnectStatus({
        onboardingComplete: Boolean(data.onboarding_complete),
        payoutsEnabled: Boolean(data.payouts_enabled),
        chargesEnabled: Boolean(data.charges_enabled),
      })
    } catch (error) {
      setStripeError(error instanceof Error ? error.message : "Failed to refresh Stripe status.")
    } finally {
      setIsSyncingStripe(false)
    }
  }

  async function continueStripeSetup() {
    setIsContinuingStripe(true)
    setStripeError(null)
    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" })
      const data = (await response.json()) as { url?: string; onboardingUrl?: string; error?: string }
      const url = data.url ?? data.onboardingUrl
      if (!response.ok || !url) {
        throw new Error(data.error ?? "Unable to continue Stripe onboarding.")
      }
      window.location.href = url
    } catch (error) {
      setStripeError(error instanceof Error ? error.message : "Unable to continue Stripe onboarding.")
      setIsContinuingStripe(false)
    }
  }

  async function openStripeDashboard() {
    setIsOpeningDashboard(true)
    setStripeError(null)
    try {
      const response = await fetch("/api/stripe/connect/dashboard")
      const data = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to open Stripe dashboard.")
      }
      window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (error) {
      setStripeError(error instanceof Error ? error.message : "Unable to open Stripe dashboard.")
    } finally {
      setIsOpeningDashboard(false)
    }
  }

  useEffect(() => {
    if (!hostingEnabled) return
    if (!stripeAccountId) return
    void syncStripeStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostingEnabled, stripeAccountId])

  useEffect(() => {
    if (!hostingEnabled) return
    if (searchParams.get("stripe") !== "success") return
    void (async () => {
      await syncStripeStatus()
      setToastMessage(
        "Payouts connected! You'll receive earnings within 2 days of each completed booking."
      )
      router.replace("/dashboard/account")
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostingEnabled, searchParams, router])

  useEffect(() => {
    if (searchParams.get("email_change") !== "confirmed") return
    setToastMessage("Email address updated successfully.")
    router.replace("/dashboard/account")
  }, [searchParams, router])

  useEffect(() => {
    if (!toastMessage) return
    const timeout = setTimeout(() => setToastMessage(null), 5500)
    return () => clearTimeout(timeout)
  }, [toastMessage])

  useEffect(() => {
    if (!notificationToast) return
    const timeout = setTimeout(() => setNotificationToast(null), 4000)
    return () => clearTimeout(timeout)
  }, [notificationToast])

  useEffect(() => {
    if (passwordResetCooldown <= 0) return
    const interval = window.setInterval(() => {
      setPasswordResetCooldown((previous) => Math.max(0, previous - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [passwordResetCooldown])

  const maskedStripeAccountId = useMemo(() => {
    if (!stripeAccountId) return null
    if (stripeAccountId.length <= 8) return stripeAccountId
    return `${stripeAccountId.slice(0, 8)}...${stripeAccountId.slice(-4)}`
  }, [stripeAccountId])
  const hasStripeAccount = Boolean(stripeAccountId)
  const isMockHost = stripeAccountId?.startsWith("acct_mock_")
  const payoutsConnected = Boolean(isMockHost || connectStatus.payoutsEnabled)

  function broadcastProfileNamePreview(nextRawName: string) {
    const nextPreviewName = nextRawName.trim() || savedName || fullName
    try {
      localStorage.setItem(PROFILE_NAME_OVERRIDE_KEY, nextPreviewName)
    } catch {
      // Ignore storage failures (private browsing/quota) and continue event syncing.
    }
    const detail = { fullName: nextPreviewName, avatarUrl: avatarUrlValue ?? undefined }
    window.dispatchEvent(new CustomEvent("dashboard:profile-updated", { detail }))
    window.dispatchEvent(new CustomEvent("app:profile-updated", { detail }))
  }

  useEffect(() => {
    broadcastProfileNamePreview(name)
    // Sync shell/dropdown with currently displayed account values on load and subsequent updates.
  }, [name, avatarUrlValue, savedName, fullName])

  function handleAvatarUploadComplete(newUrl: string) {
    setAvatarUrlValue(newUrl)
    window.dispatchEvent(new CustomEvent("dashboard:avatar-updated", { detail: { avatarUrl: newUrl } }))
    window.dispatchEvent(
      new CustomEvent("dashboard:profile-updated", { detail: { fullName: savedName || fullName, avatarUrl: newUrl } })
    )
    setMessage("Avatar updated.")
  }

  async function submitEmailChange() {
    const nextEmail = newEmail.trim().toLowerCase()
    if (!nextEmail) {
      setEmailChangeError("Please enter a new email address.")
      return
    }
    if (nextEmail === email.toLowerCase()) {
      setEmailChangeError("Please enter a different email address.")
      return
    }

    setIsUpdatingEmail(true)
    setEmailChangeError(null)
    setEmailChangeMessage(null)

    const { error } = await supabase.auth.updateUser({
      email: nextEmail,
    })

    if (error) {
      setIsUpdatingEmail(false)
      setEmailChangeError(error.message)
      return
    }

    setIsUpdatingEmail(false)
    setEmailChangeMessage(
      `A confirmation link has been sent to ${nextEmail}. Your email address will update once confirmed.`
    )
  }

  async function sendPasswordResetEmail() {
    if (isSendingPasswordReset) return

    if (passwordResetCooldown > 0) {
      setPasswordResetNotice("Email already sent. Please check your inbox.")
      return
    }

    setIsSendingPasswordReset(true)
    setPasswordResetError(null)
    setPasswordResetNotice(null)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
    })

    setIsSendingPasswordReset(false)
    if (error) {
      if (error.message.toLowerCase().includes("redirect")) {
        setPasswordResetError(
          "Password reset is not configured correctly yet. Please contact hello@usethrml.com while we fix email redirect settings."
        )
        return
      }
      setPasswordResetError("Something went wrong. Please try again or contact hello@usethrml.com")
      return
    }

    setPasswordResetSuccess(true)
    setPasswordResetCooldown(60)
  }

  return (
    <div className="space-y-6 px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl text-[#1A1410]">Account</h1>

      <section id="notifications" className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">PROFILE</h2>
        <div className="flex items-center gap-3">
          <AvatarUpload
            currentAvatarUrl={avatarUrlValue}
            userId={userId}
            displayName={name.trim() || savedName || fullName}
            onUploadComplete={handleAvatarUploadComplete}
          />
          <p className="text-xs text-[#7A6A5D]">Click your avatar to upload a JPG, PNG, or WEBP image (max 5MB).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>First name</Label>
            <Input
              placeholder="First"
              value={firstName}
              onChange={(event) => {
                const nextFirstName = event.target.value
                setFirstName(nextFirstName)
                const nextName = buildFullName(nextFirstName, lastName)
                setName(nextName)
                broadcastProfileNamePreview(nextName)
              }}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input
              placeholder="Last"
              value={lastName}
              onChange={(event) => {
                const nextLastName = event.target.value
                setLastName(nextLastName)
                const nextName = buildFullName(firstName, nextLastName)
                setName(nextName)
                broadcastProfileNamePreview(nextName)
              }}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Email</Label>
            <button
              type="button"
              onClick={() => {
                setIsEmailDialogOpen(true)
                setNewEmail("")
                setEmailChangeError(null)
                setEmailChangeMessage(null)
              }}
              className="text-xs text-[#8A7A6D] underline underline-offset-2 transition-colors hover:text-[#5D4E42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C75B3A]/40 focus-visible:ring-offset-2"
              aria-label="Change account email"
            >
              Change email
            </button>
          </div>
          <Input value={email} disabled />
        </div>
        <div className="space-y-2">
          <Label>Phone {phoneVerified ? "· Verified ✓" : ""}</Label>
          <Input
            placeholder={savedPhone || "No phone on file yet"}
            value={phoneValue}
            onChange={(event) => setPhoneValue(formatPhoneNumber(event.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>Bio</Label>
          <Textarea
            maxLength={200}
            placeholder={savedBio || "Short bio for your host profile"}
            value={bioValue}
            onChange={(event) => setBioValue(event.target.value)}
          />
        </div>
        <Button className="btn-primary" disabled={saving} onClick={saveProfile}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
        {message ? <p className="text-xs text-[#7A6A5D]">{message}</p> : null}
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">SECURITY</h2>
        {passwordResetSuccess ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4" />
                Password reset email sent to {email}.
              </p>
              <p className="mt-1 text-xs">Check your inbox — the link expires in 1 hour.</p>
            </div>
            <Button variant="outline" onClick={sendPasswordResetEmail} disabled={isSendingPasswordReset}>
              {isSendingPasswordReset ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send again"
              )}
            </Button>
            {passwordResetCooldown > 0 ? (
              <p className="text-xs text-[#7A6A5D]">You can send another reset email in {passwordResetCooldown}s.</p>
            ) : null}
          </div>
        ) : (
          <Button variant="outline" onClick={sendPasswordResetEmail} disabled={isSendingPasswordReset}>
            {isSendingPasswordReset ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send password reset email"
            )}
          </Button>
        )}
        {passwordResetNotice ? <p className="text-sm text-[#7A6A5D]">{passwordResetNotice}</p> : null}
        {passwordResetError ? <p className="text-sm text-destructive">{passwordResetError}</p> : null}
      </section>

      {hostingEnabled ? (
        <section id="house-rules" className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">PAYOUT SETTINGS</h2>
          {!hasStripeAccount ? (
            <StripeConnectBanner />
          ) : payoutsConnected ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]">
                ✓ Payouts connected
              </div>

              <div className="rounded-xl border border-[#EDE8E2] bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-[#7A6A5D]">Stripe account</p>
                <p className="mt-1 text-sm text-[#1A1410]">{maskedStripeAccountId}</p>
                <p className="mt-2 inline-flex rounded-full bg-[#DCFCE7] px-2.5 py-1 text-xs font-medium text-[#166534]">
                  Payouts: Enabled
                </p>
              </div>

              <div className="space-y-1 text-sm">
                <button
                  type="button"
                  onClick={openStripeDashboard}
                  disabled={isOpeningDashboard}
                  className="text-[#C75B3A] underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Manage payout settings →
                </button>
                <button
                  type="button"
                  onClick={openStripeDashboard}
                  disabled={isOpeningDashboard}
                  className="block text-[#C75B3A] underline-offset-2 hover:underline disabled:opacity-60"
                >
                  View payout history →
                </button>
              </div>
            </div>
          ) : connectStatus.onboardingComplete ? (
            <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
              Stripe onboarding is submitted. Payouts are still being verified and will activate soon.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                <p className="text-sm font-medium text-[#92400E]">⚠️ Finish setting up your payouts</p>
                <p className="mt-1 text-sm text-[#92400E]">
                  Your Stripe account was created but onboarding isn&apos;t complete. Bookings will be held
                  until your account is verified.
                </p>
              </div>
              <Button className="btn-primary" onClick={continueStripeSetup} disabled={isContinuingStripe}>
                {isContinuingStripe ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  "Continue setup →"
                )}
              </Button>
            </div>
          )}
          {isSyncingStripe ? <p className="text-xs text-[#7A6A5D]">Refreshing payout status...</p> : null}
          {stripeError ? <p className="text-sm text-destructive">{stripeError}</p> : null}
        </section>
      ) : null}

      {hostingEnabled ? (
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">HOUSE RULES</h2>
          <p className="text-sm text-[#6A5848]">
            Save your default house rules, then apply them across all current listings in one click.
          </p>
          <div className="space-y-2">
            <Label>One rule per line</Label>
            <Textarea
              value={houseRulesText}
              onChange={(event) => setHouseRulesText(event.target.value)}
              placeholder={savedHouseRulesText || `No smoking\nLeave the space as you found it\nRespect quiet hours`}
              rows={6}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={savingHouseRules}
              onClick={() => saveHouseRules(false)}
            >
              Save defaults only
            </Button>
            <Button
              type="button"
              className="btn-primary"
              disabled={savingHouseRules}
              onClick={() => saveHouseRules(true)}
            >
              {savingHouseRules ? "Applying..." : "Save + apply to all listings"}
            </Button>
          </div>
          {houseRulesError ? <p className="text-sm text-destructive">{houseRulesError}</p> : null}
          {houseRulesMessage ? <p className="text-sm text-[#6A5848]">{houseRulesMessage}</p> : null}
        </section>
      ) : null}

      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-[#7A6A5D]">NOTIFICATIONS</h2>
          <p className="text-xs text-[#7A6A5D]">
            {prefsSaveState === "saving"
              ? "Saving..."
              : prefsSaveState === "saved"
                ? "Saved"
                : prefsSaveState === "error"
                  ? "Unable to save"
                  : ""}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A1410]">New booking</p>
          <Switch
            checked={notificationPrefs.new_booking}
            onCheckedChange={(checked) => updateNotificationPreference("new_booking", checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A1410]">Booking cancelled</p>
          <Switch
            checked={notificationPrefs.booking_cancelled}
            onCheckedChange={(checked) => updateNotificationPreference("booking_cancelled", checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A1410]">New review</p>
          <Switch
            checked={notificationPrefs.new_review}
            onCheckedChange={(checked) => updateNotificationPreference("new_review", checked)}
          />
        </div>
        {hostingEnabled ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#1A1410]">Payout sent</p>
            <Switch
              checked={notificationPrefs.payout_sent}
              onCheckedChange={(checked) => updateNotificationPreference("payout_sent", checked)}
            />
          </div>
        ) : null}

        <div className="border-t border-[#EDE8E2] pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-[#7A6A5D]">EMAIL PREFERENCES</h3>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#1A1410]">Wellness tips and new spaces near you</p>
              <Switch
                checked={notificationPrefs.marketing_wellness_tips}
                onCheckedChange={(checked) => updateNotificationPreference("marketing_wellness_tips", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#1A1410]">Exclusive offers and promotions</p>
              <Switch
                checked={notificationPrefs.marketing_offers}
                onCheckedChange={(checked) => updateNotificationPreference("marketing_offers", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#1A1410]">Product updates from thrml</p>
              <Switch
                checked={notificationPrefs.marketing_product_updates}
                onCheckedChange={(checked) =>
                  updateNotificationPreference("marketing_product_updates", checked)
                }
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            You can unsubscribe at any time. View our{" "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>

      {toastMessage ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534] shadow-lg">
          {toastMessage}
        </div>
      ) : null}
      {notificationToast ? (
        <div
          className={`fixed bottom-4 left-4 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg ${
            notificationToast.tone === "success"
              ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
              : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
          }`}
        >
          {notificationToast.message}
        </div>
      ) : null}

      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change email</DialogTitle>
            <DialogDescription>
              Enter a new email address. We&apos;ll send a confirmation link before updating your login email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {emailChangeError ? <p className="text-sm text-destructive">{emailChangeError}</p> : null}
            {emailChangeMessage ? <p className="text-sm text-emerald-700">{emailChangeMessage}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEmailDialogOpen(false)}
              disabled={isUpdatingEmail}
            >
              Cancel
            </Button>
            <Button type="button" className="btn-primary" onClick={submitEmailChange} disabled={isUpdatingEmail}>
              {isUpdatingEmail ? "Sending..." : "Send confirmation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
