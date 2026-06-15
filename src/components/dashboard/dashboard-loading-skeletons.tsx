import { cn } from "@/lib/utils"

const pulse = "animate-pulse bg-[#EEE7DE]"

export function DashboardSkeletonBlock({ className }: { className?: string }) {
  return <div className={cn(pulse, className)} />
}

export function BookingCardSkeleton() {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(26,20,16,0.06)] md:p-5">
      <div className="grid gap-4 md:grid-cols-[180px_1fr_180px]">
        <DashboardSkeletonBlock className="h-32 rounded-2xl" />
        <div className="space-y-3">
          <DashboardSkeletonBlock className="h-4 w-32 rounded" />
          <DashboardSkeletonBlock className="h-6 w-2/3 rounded" />
          <DashboardSkeletonBlock className="h-4 w-1/2 rounded" />
          <DashboardSkeletonBlock className="h-4 w-2/3 rounded" />
        </div>
        <div className="space-y-3">
          <DashboardSkeletonBlock className="h-7 w-24 rounded" />
          <DashboardSkeletonBlock className="h-5 w-20 rounded" />
          <DashboardSkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <aside className="border-r border-[#E7DED3] bg-white">
      <div className="border-b border-[#F1E7DC] px-4 py-4">
        <DashboardSkeletonBlock className="h-9 w-36 rounded-lg" />
        <DashboardSkeletonBlock className="mt-3 h-10 w-full rounded-full" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <DashboardSkeletonBlock className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <DashboardSkeletonBlock className="h-4 w-3/5 rounded" />
              <DashboardSkeletonBlock className="h-3 w-4/5 rounded" />
            </div>
            <DashboardSkeletonBlock className="h-3 w-10 rounded" />
          </div>
        ))}
      </div>
    </aside>
  )
}

export function MessageThreadSkeleton() {
  return (
    <section className="flex h-[calc(100dvh-130px)] flex-col">
      <header className="border-b border-[#E7DED3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <DashboardSkeletonBlock className="size-10 rounded-full" />
          <div className="space-y-2">
            <DashboardSkeletonBlock className="h-4 w-28 rounded" />
            <DashboardSkeletonBlock className="h-3 w-44 rounded" />
          </div>
        </div>
        <DashboardSkeletonBlock className="mt-3 h-10 w-full rounded-md" />
      </header>
      <div className="flex-1 space-y-4 bg-[#F7F3EE] px-4 py-4">
        <div className="flex justify-start">
          <DashboardSkeletonBlock className="h-10 w-48 rounded-2xl" />
        </div>
        <div className="flex justify-end">
          <DashboardSkeletonBlock className="h-10 w-36 rounded-2xl" />
        </div>
        <div className="flex justify-start">
          <DashboardSkeletonBlock className="h-14 w-56 rounded-2xl" />
        </div>
      </div>
      <div className="border-t border-[#E7DED3] bg-white px-4 py-3">
        <DashboardSkeletonBlock className="h-10 w-full rounded-full" />
      </div>
    </section>
  )
}

export function ReferralsPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 md:px-8">
      <div className="flex items-start gap-3">
        <DashboardSkeletonBlock className="size-[52px] rounded-2xl" />
        <div className="flex-1 space-y-2 pt-1">
          <DashboardSkeletonBlock className="h-7 w-32 rounded" />
          <DashboardSkeletonBlock className="h-4 w-full max-w-md rounded" />
        </div>
      </div>

      <div className="rounded-2xl border border-[#E7DED3] bg-white p-6">
        <DashboardSkeletonBlock className="h-4 w-24 rounded" />
        <DashboardSkeletonBlock className="mt-3 h-9 w-28 rounded" />
        <DashboardSkeletonBlock className="mt-2 h-3 w-56 rounded" />
      </div>

      <div className="rounded-2xl border border-[#E7DED3] bg-white p-6">
        <DashboardSkeletonBlock className="h-4 w-20 rounded" />
        <DashboardSkeletonBlock className="mt-3 h-10 w-full rounded-lg" />
        <div className="mt-4 flex gap-2">
          <DashboardSkeletonBlock className="h-9 w-20 rounded-md" />
          <DashboardSkeletonBlock className="h-9 w-16 rounded-md" />
          <DashboardSkeletonBlock className="h-9 w-20 rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-[#E7DED3] bg-white p-4">
            <DashboardSkeletonBlock className="h-3 w-16 rounded" />
            <DashboardSkeletonBlock className="mt-2 h-8 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SavedListingCardSkeleton() {
  return (
    <div className="card-base p-3">
      <DashboardSkeletonBlock className="mb-3 aspect-[4/3] w-full rounded-xl" />
      <DashboardSkeletonBlock className="h-4 w-3/4 rounded" />
      <DashboardSkeletonBlock className="mt-2 h-3 w-1/2 rounded" />
      <DashboardSkeletonBlock className="mt-3 h-5 w-20 rounded" />
    </div>
  )
}
