"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GuestReviewForm, type GuestReviewSuccess } from "@/components/booking/GuestReviewForm"

export type { GuestReviewSuccess }

type GuestReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  guestName: string
  initialStars?: number
  onSuccess: (result: GuestReviewSuccess) => void
}

export function GuestReviewDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  initialStars = 0,
  onSuccess,
}: GuestReviewDialogProps) {
  const safeGuestName = guestName.trim() || "this guest"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,640px)] max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto rounded-2xl border-[#E6DDD3] bg-[#FBF8F4] p-0 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="border-b border-[#EFE7DE] px-5 py-4 text-left">
          <DialogTitle className="font-serif text-xl text-[#1A1410]">Rate your guest</DialogTitle>
          <DialogDescription className="text-left text-sm text-[#7A6A5D]">
            How was your experience hosting{" "}
            <span className="font-medium text-[#5E4E42]">{safeGuestName}</span>? Star ratings are public; notes are
            host-only.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <GuestReviewForm
            bookingId={bookingId}
            guestName={guestName}
            initialStars={initialStars}
            active={open}
            onSuccess={(result) => {
              onSuccess(result)
              onOpenChange(false)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
