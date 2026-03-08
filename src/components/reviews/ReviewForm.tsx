"use client"

import { useMemo, useState, type FormEvent } from "react"
import { Loader2, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"

import { StarRating } from "@/components/reviews/StarRating"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { REVIEW_TONE_BY_RATING, type SubRatings } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/client"

type ReviewFormProps = {
  bookingId: string
  listingId: string
  userId: string
  initialRating?: number
}

type UploadFile = {
  id: string
  file: File
  previewUrl: string
}

const SUB_RATING_ROWS: Array<{ key: keyof SubRatings; label: string; icon: string }> = [
  { key: "cleanliness", label: "Cleanliness", icon: "🧹" },
  { key: "accuracy", label: "Accuracy", icon: "✅" },
  { key: "communication", label: "Communication", icon: "💬" },
  { key: "value", label: "Value for money", icon: "💰" },
]

export function ReviewForm({ bookingId, listingId, userId, initialRating = 0 }: ReviewFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [overall, setOverall] = useState(Math.max(0, Math.min(5, Math.round(initialRating))))
  const [overallHover, setOverallHover] = useState<number | null>(null)
  const [subRatings, setSubRatings] = useState<SubRatings>({})
  const [comment, setComment] = useState("")
  const [recommend, setRecommend] = useState<boolean | null>(null)
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const shownOverall = overallHover ?? overall
  const overallTone = shownOverall ? REVIEW_TONE_BY_RATING[shownOverall] : "Tap a rating"
  const commentCount = comment.trim().length

  const canSubmit = overall > 0 && !isSubmitting
  const showSoftWarning = comment.length > 0 && commentCount < 20

  async function uploadReviewPhotos() {
    const uploadedUrls: string[] = []

    for (let index = 0; index < files.length; index += 1) {
      const item = files[index]
      const ext = item.file.name.split(".").pop() || "jpg"
      const safeBase = item.file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 48)
      const fileName = `${Date.now()}-${index}-${safeBase}.${ext}`
      const filePath = `${userId}/${bookingId}/${fileName}`

      const { error } = await supabase.storage.from("review-photos").upload(filePath, item.file, { upsert: false })
      if (error) throw new Error(error.message)

      const { data: publicData } = supabase.storage.from("review-photos").getPublicUrl(filePath)
      uploadedUrls.push(publicData.publicUrl)
    }

    return uploadedUrls
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const photoUrls = await uploadReviewPhotos()
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          listingId,
          ratingOverall: overall,
          ratings: subRatings,
          comment: comment.trim() || null,
          recommend,
          photoUrls,
        }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Unable to post review")

      router.push(`/review/${bookingId}/success`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post review")
      setIsSubmitting(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 3,
    onDropAccepted: (accepted) => {
      setFiles((current) => {
        const next = [...current]
        for (const file of accepted) {
          if (next.length >= 3) break
          next.push({
            id: `${file.name}-${file.size}-${Date.now()}`,
            file,
            previewUrl: URL.createObjectURL(file),
          })
        }
        return next
      })
    },
    onDropRejected: () => {
      setErrorMessage("Please upload up to 3 image files.")
    },
  })

  const ratingRowClasses = useMemo(
    () => "flex items-center justify-between gap-3 rounded-xl border border-[#E6DDD3] bg-white px-3 py-2",
    []
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[#1A1410]">Overall experience</h2>
        <StarRating
          value={shownOverall}
          interactive
          size={36}
          className="gap-2"
          onHoverChange={(value) => setOverallHover(value)}
          onChange={(value) => setOverall(value)}
        />
        <p className={`font-serif text-base italic ${overall ? "text-[#C75B3A]" : "text-[#9D8D80]"}`}>{overallTone}</p>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-[#1A1410]">
          Rate the details <span className="text-[#9D8D80]">(optional)</span>
        </p>
        <div className="space-y-2">
          {SUB_RATING_ROWS.map((row) => (
            <div key={row.key} className={ratingRowClasses}>
              <span className="text-sm text-[#6C5B4F]">
                {row.icon} {row.label}
              </span>
              <StarRating
                value={Number(subRatings[row.key] ?? 0)}
                interactive
                size={22}
                onChange={(value) => setSubRatings((prev) => ({ ...prev, [row.key]: value }))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium text-[#1A1410]">Written review</p>
        <Textarea
          value={comment}
          maxLength={1000}
          placeholder="Share your experience - what did you love? What could be better? Your honest feedback helps the community."
          className="min-h-[120px] resize-none rounded-xl border-[#E2D8CC] bg-white text-sm text-[#2C231D]"
          onChange={(event) => {
            setComment(event.target.value)
            const el = event.currentTarget
            el.style.height = "auto"
            el.style.height = `${el.scrollHeight}px`
          }}
        />
        <div className="flex items-center justify-between">
          <p className={`text-xs ${showSoftWarning ? "text-amber-700" : "text-[#9D8D80]"}`}>
            {showSoftWarning ? "Helpful reviews usually include at least 20 characters." : " "}
          </p>
          {comment.length > 0 || comment.length >= 800 ? (
            <p className={`text-xs ${comment.length >= 1000 ? "text-rose-700" : "text-[#9D8D80]"}`}>{comment.length}/1000</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[#1A1410]">Add photos</p>
          <p className="text-xs text-[#8C7C70]">Show others what to expect 📸</p>
        </div>
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition ${
            isDragActive ? "border-[#C75B3A] bg-[#FFF5EE]" : "border-[#D7CCBE] bg-white"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-2 size-5 text-[#A28E7F]" />
          <p className="text-sm text-[#5E4E42]">Drop images here or click to upload</p>
          <p className="text-xs text-[#8C7C70]">Up to 3 photos</p>
        </div>
        {files.length ? (
          <div className="grid grid-cols-3 gap-2">
            {files.map((item) => (
              <div key={item.id} className="relative overflow-hidden rounded-lg">
                <img src={item.previewUrl} alt="Review upload preview" className="h-24 w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) => {
                      URL.revokeObjectURL(item.previewUrl)
                      return current.filter((entry) => entry.id !== item.id)
                    })
                  }
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                  aria-label="Remove photo"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium text-[#1A1410]">Would you recommend this space to a friend?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRecommend(true)}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
              recommend === true
                ? "border-[#1A1410] bg-[#1A1410] text-white"
                : "border-[#D7CCBE] bg-white text-[#45372D]"
            }`}
          >
            👍 Yes
          </button>
          <button
            type="button"
            onClick={() => setRecommend(false)}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
              recommend === false
                ? "border-[#1A1410] bg-[#1A1410] text-white"
                : "border-[#D7CCBE] bg-white text-[#45372D]"
            }`}
          >
            👎 No
          </button>
        </div>
      </section>

      {errorMessage ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}

      <Button
        type="submit"
        disabled={!canSubmit}
        className="h-12 w-full rounded-xl bg-[#C75B3A] text-base font-semibold text-white hover:bg-[#B24E31]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Posting...
          </>
        ) : (
          "Post your review"
        )}
      </Button>

      <p className="text-center text-xs text-[#8D7D70]">Reviews are posted publicly and cannot be deleted after 48 hours.</p>
    </form>
  )
}
