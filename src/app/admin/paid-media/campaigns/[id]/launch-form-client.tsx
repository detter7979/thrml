"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, Loader2, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Ad, AdSet, Campaign } from "@/types/paid-media"

import {
  launchAdFromForm,
  launchAdSetFromForm,
  launchAllAdSetsForCampaign,
  launchAllAdsForAdSet,
  launchCampaignFromForm,
  type ActionResult,
  type LaunchBulkItemResult,
} from "./actions"

function metaCampaignUrl(platformCampaignId: string): string {
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${encodeURIComponent(platformCampaignId)}`
}

async function copyWithToast(text: string, setToast: (msg: string | null) => void) {
  try {
    await navigator.clipboard.writeText(text)
    setToast("Copied")
    setTimeout(() => setToast(null), 1600)
  } catch {
    setToast("Copy failed")
    setTimeout(() => setToast(null), 2000)
  }
}

function useRefreshOnOk(state: ActionResult | null) {
  const router = useRouter()
  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])
}

function PanelShell({
  title,
  step,
  locked,
  completed,
  active,
  children,
}: {
  title: string
  step: string
  locked: boolean
  completed: boolean
  active: boolean
  children: React.ReactNode
}) {
  const border = completed
    ? "border-green-600/50"
    : active
      ? "border-[#9A4A33]"
      : "border-[#DCCDBA]"
  const bg = completed
    ? "bg-[#E6F4EA]"
    : active
      ? "bg-[#FCF8F3]"
      : locked
        ? "bg-[#F3EADD] opacity-50"
        : "bg-[#FCF8F3]"

  return (
    <section
      className={`rounded-2xl border-2 p-4 shadow-sm ${border} ${bg} ${locked && !completed ? "pointer-events-none" : ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {locked && !completed ? <Lock className="size-4 shrink-0 text-[#6E5B49]" aria-hidden /> : null}
        {completed ? <CheckCircle2 className="size-5 shrink-0 text-green-700" aria-hidden /> : null}
        <p className="text-xs font-semibold uppercase tracking-wide text-[#9A4A33]">{step}</p>
        <h2 className="text-lg font-semibold text-[#2A2118]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function CopyNameButton({ disabled, onCopy }: { disabled: boolean; onCopy: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="shrink-0 rounded p-1 text-[#9A4A33] hover:bg-[#F3EADD] disabled:opacity-40"
      aria-label="Copy name"
      onClick={onCopy}
    >
      <Copy className="size-3.5" />
    </button>
  )
}

function AdSetRow({
  adSet,
  disabled,
  onCopyName,
}: {
  adSet: AdSet
  disabled: boolean
  onCopyName: (text: string) => void
}) {
  const [state, formAction, pending] = useActionState(launchAdSetFromForm, null as ActionResult | null)
  useRefreshOnOk(state)

  const isDraft = adSet.status === "DRAFT"

  return (
    <tr className="border-b border-[#E7DACA] last:border-0">
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{adSet.legacy_id ?? "—"}</td>
      <td className="max-w-[160px] px-2 py-2">
        <div className="flex items-center gap-1">
          <span className="line-clamp-2 text-sm">{adSet.name}</span>
          <CopyNameButton disabled={disabled} onCopy={() => onCopyName(adSet.name)} />
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{adSet.audience_src}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{adSet.placement}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{adSet.conv_event}</td>
      <td className="px-2 py-2 align-top">
        {isDraft ? (
          <form action={formAction} className="flex max-w-[160px] flex-col gap-1">
            <input type="hidden" name="adSetId" value={adSet.id} />
            <input
              name="platformAdSetId"
              placeholder="Meta ad set ID"
              disabled={disabled || pending}
              className="w-full rounded border border-[#DCCDBA] bg-white px-2 py-1 font-mono text-xs"
              inputMode="numeric"
            />
            <Button
              type="submit"
              size="sm"
              disabled={disabled || pending}
              className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Mark as TEST"}
            </Button>
          </form>
        ) : (
          <span className="text-xs text-[#6E5B49]">—</span>
        )}
      </td>
      <td className="px-2 py-2 align-top">
        {isDraft ? (
          <div
            data-launch-bulk="adset"
            data-bulk-adset-id={adSet.id}
            className="flex max-w-[160px] flex-col gap-1"
          >
            <input
              name="platformAdSetIdBulk"
              disabled={disabled}
              placeholder="For bulk launch"
              className="w-full rounded border border-[#DCCDBA] bg-white px-2 py-1 font-mono text-xs"
              inputMode="numeric"
            />
          </div>
        ) : (
          <span className="text-xs text-[#6E5B49]">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{adSet.status}</td>
      <td className="px-2 py-2 text-xs text-[#9A4A33]">{state && !state.ok ? state.error : null}</td>
    </tr>
  )
}

function AdRow({
  ad,
  adSetLabel,
  disabled,
  onCopyName,
}: {
  ad: Ad
  adSetLabel: string
  disabled: boolean
  onCopyName: (text: string) => void
}) {
  const [state, formAction, pending] = useActionState(launchAdFromForm, null as ActionResult | null)
  useRefreshOnOk(state)

  const isDraft = ad.status === "DRAFT"

  return (
    <tr className="border-b border-[#E7DACA] last:border-0">
      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{ad.legacy_id ?? "—"}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs text-[#6E5B49]">{adSetLabel}</td>
      <td className="max-w-[140px] px-2 py-2">
        <div className="flex items-center gap-1">
          <span className="line-clamp-2 text-sm">{ad.name}</span>
          <CopyNameButton disabled={disabled} onCopy={() => onCopyName(ad.name)} />
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{ad.variant}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{ad.angle}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{ad.format}</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{ad.cta}</td>
      <td className="max-w-[120px] truncate px-2 py-2 text-xs text-[#5B4A3A]">{ad.hook_copy ?? "—"}</td>
      <td className="px-2 py-2 align-top">
        {isDraft ? (
          <form action={formAction} className="flex max-w-[150px] flex-col gap-1">
            <input type="hidden" name="adId" value={ad.id} />
            <input
              name="platformAdId"
              placeholder="Meta ad ID"
              disabled={disabled || pending}
              className="w-full rounded border border-[#DCCDBA] bg-white px-2 py-1 font-mono text-xs"
              inputMode="numeric"
            />
            <Button
              type="submit"
              size="sm"
              disabled={disabled || pending}
              className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Mark as TEST"}
            </Button>
          </form>
        ) : (
          <span className="text-xs text-[#6E5B49]">—</span>
        )}
      </td>
      <td className="px-2 py-2 align-top">
        {isDraft ? (
          <div data-launch-bulk="ad" data-bulk-ad-id={ad.id} data-bulk-adset-id={ad.ad_set_id} className="flex max-w-[150px]">
            <input
              name="platformAdIdBulk"
              disabled={disabled}
              placeholder="For bulk launch"
              className="w-full rounded border border-[#DCCDBA] bg-white px-2 py-1 font-mono text-xs"
              inputMode="numeric"
            />
          </div>
        ) : (
          <span className="text-xs text-[#6E5B49]">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-xs">{ad.status}</td>
      <td className="px-2 py-2 text-xs text-[#9A4A33]">{state && !state.ok ? state.error : null}</td>
    </tr>
  )
}

export function LaunchFormClient({
  campaign,
  adSets,
  ads,
}: {
  campaign: Campaign
  adSets: AdSet[]
  ads: Ad[]
}) {
  const router = useRouter()
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [bulkBusy, startBulk] = useTransition()
  const [bulkAdsBusy, startBulkAds] = useTransition()
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [bulkAdsMessage, setBulkAdsMessage] = useState<string | null>(null)

  const [campaignState, campaignFormAction, campaignPending] = useActionState(launchCampaignFromForm, null as ActionResult | null)
  useRefreshOnOk(campaignState)

  const aComplete = campaign.status !== "DRAFT"
  const panelAConnected = Boolean(campaign.platform_campaign_id)
  const bComplete = adSets.length === 0 || adSets.every((s) => s.status === "TEST")
  const cComplete = ads.length === 0 || ads.every((a) => a.status === "TEST")
  const bLocked = campaign.status === "DRAFT"
  const cLocked = !adSets.some((s) => s.status === "TEST")

  const activeKey = !aComplete ? "A" : !bComplete ? "B" : !cComplete ? "C" : "done"

  const adSetLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of adSets) m.set(s.id, s.legacy_id ?? s.name)
    return m
  }, [adSets])

  const runBulkAdSets = () => {
    setBulkMessage(null)
    const nodes = document.querySelectorAll<HTMLElement>("[data-launch-bulk='adset']")
    const pairs: { id: string; platformId: string }[] = []
    nodes.forEach((el) => {
      const id = el.dataset.bulkAdsetId
      const input = el.querySelector<HTMLInputElement>("input[name='platformAdSetIdBulk']")
      const platformId = input?.value?.trim() ?? ""
      if (!id || !platformId) return
      pairs.push({ id, platformId })
    })
    if (!pairs.length) {
      setBulkMessage("Fill bulk Meta ad set IDs for at least one row.")
      return
    }
    startBulk(async () => {
      const res = await launchAllAdSetsForCampaign(campaign.id, pairs)
      if (!res.ok) {
        setBulkMessage(res.error)
        return
      }
      const failed = res.results.filter((r): r is Extract<LaunchBulkItemResult, { ok: false }> => !r.ok)
      setBulkMessage(
        failed.length
          ? `Partial: ${failed.map((f) => `${f.id}: ${f.error}`).join("; ")}`
          : `Updated ${res.results.length} ad set(s).`
      )
      router.refresh()
    })
  }

  const runBulkAds = () => {
    setBulkAdsMessage(null)
    const nodes = document.querySelectorAll<HTMLElement>("[data-launch-bulk='ad']")
    const bySet = new Map<string, { id: string; platformId: string }[]>()
    nodes.forEach((el) => {
      const adId = el.dataset.bulkAdId
      const adSetId = el.dataset.bulkAdsetId
      const input = el.querySelector<HTMLInputElement>("input[name='platformAdIdBulk']")
      const platformId = input?.value?.trim() ?? ""
      if (!adId || !adSetId || !platformId) return
      const arr = bySet.get(adSetId) ?? []
      arr.push({ id: adId, platformId })
      bySet.set(adSetId, arr)
    })
    if (!bySet.size) {
      setBulkAdsMessage("Fill bulk Meta ad IDs for at least one row.")
      return
    }
    startBulkAds(async () => {
      const summaries: string[] = []
      for (const [adSetId, items] of bySet) {
        const res = await launchAllAdsForAdSet(adSetId, items)
        if (!res.ok) {
          summaries.push(`${adSetId}: ${res.error}`)
          continue
        }
        const failed = res.results.filter((r): r is Extract<LaunchBulkItemResult, { ok: false }> => !r.ok)
        if (failed.length) summaries.push(`${adSetId}: ${failed.map((f) => f.error).join(", ")}`)
        else summaries.push(`${adSetId}: ${res.results.length} ok`)
      }
      setBulkAdsMessage(summaries.join(" · "))
      router.refresh()
    })
  }

  const panelAGreen = aComplete && panelAConnected

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl text-[#2A2118]">Launch checklist</h2>

      {copyToast ? (
        <p className="text-xs text-[#2D4A22]" role="status">
          {copyToast}
        </p>
      ) : null}

      <PanelShell
        title="Campaign in Meta"
        step="Panel A"
        locked={false}
        completed={panelAGreen}
        active={activeKey === "A"}
      >
        {panelAConnected ? (
          <div className="space-y-2 text-sm text-[#2A2118]">
            <p className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="size-4 text-green-700" aria-hidden />
              Connected to Meta campaign{" "}
              <code className="select-all rounded bg-white/80 px-1 font-mono text-xs">
                {campaign.platform_campaign_id}
              </code>
            </p>
            <Link
              href={metaCampaignUrl(campaign.platform_campaign_id!)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-[#DCCDBA] bg-white px-3 py-1 text-xs text-[#9A4A33] hover:bg-[#F3EADD]"
            >
              Open in Ads Manager
            </Link>
          </div>
        ) : campaign.status === "DRAFT" ? (
          <form action={campaignFormAction} className="max-w-md space-y-3">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <div>
              <label className="block text-xs font-medium text-[#6E5B49]" htmlFor="platformCampaignId">
                Meta Campaign ID
              </label>
              <input
                id="platformCampaignId"
                name="platformCampaignId"
                required
                className="mt-1 w-full rounded border border-[#DCCDBA] bg-white px-3 py-2 font-mono text-sm"
                placeholder="12023456789012345"
                inputMode="numeric"
              />
              <p className="mt-1 text-xs text-[#6E5B49]">
                From Ads Manager URL after creating the campaign: numeric only, 12–20 digits (no{" "}
                <code className="font-mono">act_</code> prefix).
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6E5B49]" htmlFor="metaName">
                Campaign name in Meta
              </label>
              <input
                id="metaName"
                name="metaName"
                defaultValue={campaign.name}
                className="mt-1 w-full rounded border border-[#DCCDBA] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6E5B49]" htmlFor="dailyBudget">
                Daily budget set in Meta (USD)
              </label>
              <input
                id="dailyBudget"
                name="dailyBudget"
                type="number"
                step="0.01"
                min={0}
                defaultValue={campaign.daily_budget_usd ?? ""}
                className="mt-1 w-full rounded border border-[#DCCDBA] bg-white px-3 py-2 text-sm"
              />
            </div>
            {campaignState && !campaignState.ok ? (
              <p className="text-sm text-[#9A4A33]">{campaignState.error}</p>
            ) : null}
            <Button
              type="submit"
              disabled={campaignPending}
              className="bg-[#9A4A33] text-white hover:bg-[#823A2A]"
            >
              {campaignPending ? <Loader2 className="size-4 animate-spin" /> : "Mark campaign as TEST"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-[#6E5B49]">
            Campaign is {campaign.status} but has no platform campaign id — add the Meta ID in the database or
            contact engineering.
          </p>
        )}
      </PanelShell>

      <PanelShell
        title="Ad sets"
        step="Panel B"
        locked={bLocked}
        completed={bComplete}
        active={activeKey === "B"}
      >
        {adSets.length === 0 ? (
          <p className="text-sm text-[#6E5B49]">No ad sets on this campaign.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={bLocked || bulkBusy}
                onClick={runBulkAdSets}
                className="border-[#DCCDBA] text-[#2A2118] hover:bg-[#F3EADD]"
              >
                {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : "Mark all TEST (bulk column)"}
              </Button>
              {bulkMessage ? <span className="text-xs text-[#5B4A3A]">{bulkMessage}</span> : null}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#E7DACA] bg-white/60">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E7DACA] text-xs uppercase tracking-wide text-[#6E5B49]">
                    <th className="px-2 py-2">legacy_id</th>
                    <th className="px-2 py-2">name</th>
                    <th className="px-2 py-2">audience</th>
                    <th className="px-2 py-2">placement</th>
                    <th className="px-2 py-2">conv</th>
                    <th className="px-2 py-2">platform + action</th>
                    <th className="px-2 py-2">bulk ID</th>
                    <th className="px-2 py-2">status</th>
                    <th className="px-2 py-2">note</th>
                  </tr>
                </thead>
                <tbody>
                  {adSets.map((row) => (
                    <AdSetRow
                      key={row.id}
                      adSet={row}
                      disabled={bLocked}
                      onCopyName={(t) => void copyWithToast(t, setCopyToast)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PanelShell>

      <PanelShell
        title="Ads"
        step="Panel C"
        locked={cLocked}
        completed={cComplete}
        active={activeKey === "C"}
      >
        {ads.length === 0 ? (
          <p className="text-sm text-[#6E5B49]">No ads on this campaign.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={cLocked || bulkAdsBusy}
                onClick={runBulkAds}
                className="border-[#DCCDBA] text-[#2A2118] hover:bg-[#F3EADD]"
              >
                {bulkAdsBusy ? <Loader2 className="size-4 animate-spin" /> : "Mark all TEST (bulk column)"}
              </Button>
              {bulkAdsMessage ? <span className="text-xs text-[#5B4A3A]">{bulkAdsMessage}</span> : null}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#E7DACA] bg-white/60">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E7DACA] text-xs uppercase tracking-wide text-[#6E5B49]">
                    <th className="px-2 py-2">legacy_id</th>
                    <th className="px-2 py-2">ad set</th>
                    <th className="px-2 py-2">name</th>
                    <th className="px-2 py-2">variant</th>
                    <th className="px-2 py-2">angle</th>
                    <th className="px-2 py-2">format</th>
                    <th className="px-2 py-2">cta</th>
                    <th className="px-2 py-2">hook</th>
                    <th className="px-2 py-2">platform + action</th>
                    <th className="px-2 py-2">bulk ID</th>
                    <th className="px-2 py-2">status</th>
                    <th className="px-2 py-2">note</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((row) => (
                    <AdRow
                      key={row.id}
                      ad={row}
                      adSetLabel={adSetLabelById.get(row.ad_set_id) ?? row.ad_set_id.slice(0, 8)}
                      disabled={cLocked}
                      onCopyName={(t) => void copyWithToast(t, setCopyToast)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PanelShell>

      <p className="text-xs text-[#6E5B49]">
        Audit: <code className="font-mono">actions_log.kind = LAUNCH_TEST</code> with{" "}
        <code className="font-mono">event</code> = campaign_launched / ad_set_launched / ad_launched.
      </p>
    </div>
  )
}
