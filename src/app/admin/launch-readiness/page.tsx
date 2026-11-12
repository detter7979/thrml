import Link from "next/link"

import { requireAdmin } from "@/lib/admin-guard"
import { fetchFoundingHostSettings, foundingSpotsRemaining } from "@/lib/host/founding-host"
import { guestBookingsOpen } from "@/lib/host/host-funnel"
import { LAUNCH_CRITERIA } from "@/lib/launch/readiness"
import { loadLaunchReadiness } from "@/lib/launch/load-readiness"

export const dynamic = "force-dynamic"

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
      aria-label={ok ? "Yes" : "No"}
    >
      {ok ? "✓" : "✕"}
    </span>
  )
}

export default async function LaunchReadinessPage() {
  const { admin } = await requireAdmin()
  const [report, foundingSettings] = await Promise.all([
    loadLaunchReadiness(admin),
    fetchFoundingHostSettings(admin),
  ])
  const spotsLeft = await foundingSpotsRemaining(admin, foundingSettings.cap)
  const open = guestBookingsOpen()

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Guest launch readiness</h1>
        <p className="text-sm text-neutral-500">
          Guest marketing starts when every blocking criterion is met. Then set{" "}
          <code className="rounded bg-neutral-100 px-1">GUEST_BOOKINGS_OPEN=true</code> in Vercel — host emails and
          the landing page switch over automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-neutral-500">Status</p>
          <p className={`text-lg font-semibold ${report.readyToLaunch ? "text-emerald-700" : "text-amber-700"}`}>
            {open ? "Guest bookings open" : report.readyToLaunch ? "Ready to launch" : "Not ready yet"}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-neutral-500">Ready listings</p>
          <p className="text-lg font-semibold text-neutral-900">
            {report.readyCount} / {LAUNCH_CRITERIA.minReadyListings}
            <span className="ml-2 text-sm font-normal text-neutral-500">({report.liveCount} live)</span>
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-neutral-500">Founding host spots left</p>
          <p className="text-lg font-semibold text-neutral-900">
            {spotsLeft} / {foundingSettings.cap}
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-white">
        <h2 className="border-b px-4 py-3 text-sm font-semibold text-neutral-900">Criteria</h2>
        <ul className="divide-y">
          {report.criteria.map((criterion) => (
            <li key={criterion.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Mark ok={criterion.met} />
              <span className="flex-1 text-neutral-800">
                {criterion.label}
                {!criterion.blocking ? (
                  <span className="ml-2 text-xs text-neutral-400">(listings failing this don&apos;t count as ready)</span>
                ) : null}
              </span>
              <span className="text-neutral-500">{criterion.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white">
        <h2 className="border-b px-4 py-3 text-sm font-semibold text-neutral-900">Live listings</h2>
        {report.checks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">No live listings yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Listing</th>
                <th className="px-4 py-2 font-medium">Host</th>
                <th className="px-4 py-2 font-medium">{LAUNCH_CRITERIA.minPhotos}+ photos</th>
                <th className="px-4 py-2 font-medium">Calendar open {LAUNCH_CRITERIA.openWeeks} wks</th>
                <th className="px-4 py-2 font-medium">Host verified</th>
                <th className="px-4 py-2 font-medium">Payouts on</th>
                <th className="px-4 py-2 font-medium">Ready</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.checks.map((check) => (
                <tr key={check.listing.id}>
                  <td className="px-4 py-2">
                    <Link href={`/listing/${check.listing.id}`} className="text-neutral-900 hover:underline">
                      {check.listing.title ?? "Untitled"}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-400">{check.listing.serviceType}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{check.host?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Mark ok={check.hasPhotos} /> <span className="text-xs text-neutral-400">{check.listing.photoCount}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Mark ok={check.calendarOpen} />
                  </td>
                  <td className="px-4 py-2">
                    <Mark ok={check.hostVerified} />
                  </td>
                  <td className="px-4 py-2">
                    <Mark ok={check.hostPayouts} />
                  </td>
                  <td className="px-4 py-2">
                    <Mark ok={check.ready} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-neutral-400">
        Areas are approximated from listing coordinates (~4 km cells). Test or demo listings count here — deactivate
        them before launch.
      </p>
    </div>
  )
}
