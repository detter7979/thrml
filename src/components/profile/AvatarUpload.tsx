"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Camera, Check, Loader2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

function getInitials(displayName: string) {
  return displayName
    .split(" ")
    .map((part) => part.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function extensionForType(type: string) {
  if (type === "image/jpeg") return "jpg"
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  return "jpg"
}

export function AvatarUpload({
  currentAvatarUrl,
  userId,
  displayName,
  onUploadComplete,
}: {
  currentAvatarUrl: string | null
  userId: string
  displayName: string
  onUploadComplete: (newUrl: string) => void
}) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const initials = useMemo(() => getInitials(displayName || "Member"), [displayName])

  useEffect(() => {
    if (!showSuccess) return
    const timeout = window.setTimeout(() => setShowSuccess(false), 1200)
    return () => window.clearTimeout(timeout)
  }, [showSuccess])

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)

    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      setError("Please upload a JPG, PNG, or WEBP image.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Image must be smaller than 5MB.")
      event.target.value = ""
      return
    }

    setIsUploading(true)
    try {
      const ext = extensionForType(file.type)
      const path = `${userId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path)
      const cacheBustedUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`

      const { data: updatedById, error: updateByIdError } = await supabase
        .from("profiles")
        .update({ avatar_url: cacheBustedUrl })
        .eq("id", userId)
        .select("id")

      let profileUpdateError = updateByIdError
      let avatarPersisted = Array.isArray(updatedById) && updatedById.length > 0

      if (!profileUpdateError && !avatarPersisted) {
        const { data: updatedByUserId, error: updateByUserIdError } = await supabase
          .from("profiles")
          .update({ avatar_url: cacheBustedUrl })
          .eq("user_id", userId)
          .select("id")

        const isMissingUserIdColumn = Boolean(
          updateByUserIdError?.message?.includes("column profiles.user_id does not exist")
        )
        if (!isMissingUserIdColumn) {
          profileUpdateError = updateByUserIdError
          avatarPersisted = Array.isArray(updatedByUserId) && updatedByUserId.length > 0
        }
      }

      if (!profileUpdateError && !avatarPersisted) {
        const { data: upsertedRows, error: upsertError } = await supabase
          .from("profiles")
          .upsert({ id: userId, avatar_url: cacheBustedUrl }, { onConflict: "id" })
          .select("id")
        profileUpdateError = upsertError
        avatarPersisted = Array.isArray(upsertedRows) && upsertedRows.length > 0
      }

      if (profileUpdateError || !avatarPersisted) {
        throw profileUpdateError ?? new Error("Unable to persist avatar URL to profile.")
      }

      setShowSuccess(true)
      onUploadComplete(cacheBustedUrl)
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Failed to upload avatar."
      if (message.toLowerCase().includes("bucket not found")) {
        setError("Avatar storage is not configured yet. Ask an admin to run the latest database migration.")
      } else {
        setError(message)
      }
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative inline-flex size-24 items-center justify-center overflow-hidden rounded-full border border-[#E7DED3] bg-[#F3ECE5] text-lg font-semibold text-[#5D4E42]"
        aria-label="Upload avatar"
        disabled={isUploading}
      >
        {currentAvatarUrl ? (
          <img src={currentAvatarUrl} alt={displayName} className="size-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}

        <span className="pointer-events-none absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="pointer-events-none absolute right-1 bottom-1 inline-flex size-7 items-center justify-center rounded-full bg-white text-[#1A1410] opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Camera className="size-4" />
        </span>

        {isUploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Loader2 className="size-6 animate-spin text-white" />
          </span>
        ) : null}

        {showSuccess && !isUploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="size-5" />
            </span>
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelected}
        className="hidden"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
