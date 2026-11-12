import Link from "next/link"
import { Check } from "lucide-react"

import { draftProgressPercent, hostSetupSteps } from "@/lib/host/host-funnel"
import { isSaunasOnlyLaunch } from "@/lib/launch-config"
import { createClient } from "@/lib/supabase/server"

/**
 * "Finish setting up" checklist for hosts: agreement → listing → identity → payouts.
 * Hidden once everything is done.
 */
export async function HostSetupChecklist({ userId }: { userId: string }) {
  const supabase = await createClient()
  const [{ data: profile }, { count: liveCount }, { data: draft }] = await Promise.all([
    supabase
      .from("profiles")
      .select("host_terms_accepted, id_verified, stripe_payouts_enabled")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("host_id", userId)
      .eq("is_active", true),
    supabase.from("host_listing_drafts").select("step, total_steps").eq("host_id", userId).maybeSingle(),
  ])

  const hasLiveListing = (liveCount ?? 0) > 0
  const firstStep = isSaunasOnlyLaunch() ? 2 : 1
  const draftPercent =
    !hasLiveListing && draft && typeof draft.step === "number"
      ? draftProgressPercent(draft.step, Number(draft.total_steps ?? 5), firstStep)
      : null

  const { steps, completed, total } = hostSetupSteps({
    hostTermsAccepted: profile?.host_terms_accepted === true,
    hasLiveListing,
    draftPercent,
    idVerified: profile?.id_verified === true,
    payoutsEnabled: profile?.stripe_payouts_enabled === true,
  })

  if (completed === total) return null
  const nextStep = steps.find((item) => !item.done)

  return (
    <section className="rounded-2xl border border-[#EADFD4] bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-[#1A1410]">Finish setting up</h2>
        <span className="text-xs font-medium text-[#7A6A5D]">
          {completed} of {total} done
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F3E8DE]">
        <div
          className="h-full rounded-full bg-[#C4623A] transition-all"
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((item) => {
          const isNext = item.id === nextStep?.id
          return (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                isNext ? "border-[#E8C4B2] bg-[#FFF8F4]" : "border-[#F0E8E0]"
              }`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                  item.done ? "border-[#2F7A46] bg-[#2F7A46] text-white" : "border-[#D8CBBE] text-transparent"
                }`}
                aria-hidden
              >
                <Check className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${item.done ? "text-[#7A6A5D] line-through" : "text-[#1A1410]"}`}>
                  {item.label}
                </p>
                {!item.done ? <p className="text-xs text-[#7A6A5D]">{item.detail}</p> : null}
              </div>
              {!item.done ? (
                <Link
                  href={item.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    isNext ? "bg-[#C4623A] text-white hover:bg-[#b05530]" : "text-[#8B4513] hover:underline"
                  }`}
                >
                  {item.cta}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
