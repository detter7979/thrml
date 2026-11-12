import { formatHostKeepPercent } from "@/lib/fees"
import { fetchFoundingHostSettings, foundingFeeStatus } from "@/lib/host/founding-host"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

/** Founding host perk status on the host dashboard. Renders nothing for other hosts. */
export async function FoundingHostStatus({ userId }: { userId: string }) {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("founding_host, founding_fee_expires_at")
    .eq("id", userId)
    .maybeSingle()
  if (profile?.founding_host !== true) return null

  const settings = await fetchFoundingHostSettings(createAdminClient())
  const status = foundingFeeStatus({ profile, settings })
  if (status.kind === "none" || status.kind === "ended") return null

  const keep = formatHostKeepPercent(settings.feePercent)

  return (
    <section className="rounded-2xl border border-[#E8C4B2] bg-[#FFF8F4] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#A04A2A]">Founding host</p>
      <h2 className="mt-1 font-serif text-xl text-[#1A1410]">
        You keep {keep} — a {settings.feePercent}% fee
      </h2>
      <p className="mt-1 text-sm text-[#5C4D42]">
        {status.kind === "pending"
          ? `Your reduced fee runs for ${settings.windowDays} days, starting with your first booking — so it doesn't run down before guests can book.`
          : `Your reduced fee runs until ${formatDate(status.expiresAt)} (${status.daysLeft} day${
              status.daysLeft === 1 ? "" : "s"
            } left).`}
      </p>
    </section>
  )
}
