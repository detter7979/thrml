"use client"
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import type { RenderJob, VideoConfig } from "@/lib/agent/types"
import { parseStoredStaticVariations } from "@/lib/agent/host-monetization-static"
import { resolveBriefCopyForMeta } from "@/lib/agent/brief-copy-for-meta"
import {
  canLaunchAsPlacementBundle,
  selectPlacementBundleAssets,
  toLaunchableAssetRow,
  validatePlacementBundle,
} from "@/lib/agent/launch-creative-bundle"
import {
  buildOutFormatsForAsset,
  missingFormatsForVariation,
  nextVariationLabelsForBrief,
  targetFormatsForBrief,
} from "@/lib/agent/static-brief-plan"
import { briefUsesSvgTemplate } from "@/lib/agent/svg-template-shared"
import { BriefIntakePanel } from "@/components/admin/creative/brief-intake-panel"
import { CreativePipelinePurgePanel } from "@/components/admin/creative/creative-pipeline-purge-panel"
import {
  canEditPhotoAsset,
  CreativeAssetCard,
} from "@/components/admin/creative/creative-asset-card"
import {
  BriefEditorModal,
  structuredEditorFromBrief,
  structuredEditorToPatch,
  type StructuredBriefEditorState,
} from "@/components/admin/creative/brief-editor-modal"

type AgentRun = {
  id: string; agent_name: string; status: string; started_at: string
  completed_at: string | null; duration_ms: number | null
  results: Record<string, unknown> | null; error_message: string | null
}
type OpsAlert = {
  id: string; severity: string; category: string; message: string
  resolved: boolean; created_at: string
}
type FinanceSnap = {
  snapshot_date: string; booking_count: number; gross_booking_value: number
  platform_revenue: number; net_platform_revenue: number; new_users: number
}
type QueueItem = {
  id: string; queue_type: string; platform: string; concept: string | null
  copy_suggestion: string | null; hook_suggestion: string | null
  status: string; approved_at: string | null; created_at: string
}
type InboxDraft = {
  id: string; from_email: string; subject: string | null; category: string
  draft_reply: string | null; approved: boolean; created_at: string
}
type CreativeBrief = {
  id: string; trigger_type: string | null; trigger_data: Record<string, unknown> | null
  status: string | null; hypothesis: string | null; target_audience: string | null
  hook: string | null; format: string | null; visual_direction: string | null
  copy_primary: string | null; copy_headline: string | null; copy_subtext: string | null
  cta: string | null; reference_image_urls: string[] | null; rationale: string | null
  campaign_short_name: string | null; success_criteria: Record<string, unknown> | null
  created_at: string; approved_at: string | null; rejected_at?: string | null
  video_config?: VideoConfig | null
}
type CreativeAsset = {
  id: string; brief_id: string | null; asset_type: string | null; gcs_url: string | null
  gcs_path?: string | null
  status: string | null; performance_data: Record<string, unknown> | null
  variation_index: number | null; approved_at: string | null; launched_at: string | null
  meta_adset_id: string | null; meta_ad_id?: string | null;   generation_tool?: string | null
  convention_name?: string | null
  variation_label?: string | null; format?: string | null; signed_url?: string | null
  created_at: string; creative_briefs?: CreativeBrief | CreativeBrief[] | null
}
type MetaCampaign = {
  platform_id: string; campaign_name: string; status: string | null
}
type MetaAdset = {
  id: string; platform_id: string; platform_campaign_id: string; campaign_name: string
  adset_name: string; status: string | null
  market: string | null; aud_type: string | null; goal_type: string | null
}
type CreativePipelineData = {
  briefs: CreativeBrief[]
  generatingBriefs: CreativeBrief[]
  approvedVideoBriefs?: CreativeBrief[]
  videoGeneratingBriefs?: CreativeBrief[]
  renderJobsByBrief?: Record<string, RenderJob[]>
  generatedAssets: CreativeAsset[]
  launchedAssets: CreativeAsset[]
  activeMetaCampaigns?: MetaCampaign[]
  activeMetaAdsets: MetaAdset[]
  metaLaunchSource?: "meta" | "database"
  runwayConfigured?: boolean
}

function isVideoBrief(brief: CreativeBrief) {
  return Boolean(brief.video_config && typeof brief.video_config === "object")
}

function jobStatusClass(status: RenderJob["status"]) {
  const map: Record<RenderJob["status"], string> = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-muted text-muted-foreground",
  }
  return map[status] ?? "bg-muted text-muted-foreground"
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function shortText(value: string | null | undefined, max = 120) {
  if (!value) return "—"
  return value.length > max ? `${value.slice(0, max)}...` : value
}
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed")
  return json as T
}
function readMetric(data: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = data?.[key]
    if (typeof value === "number") return value
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}
function isLaunchableVideo(asset: CreativeAsset) {
  return asset.generation_tool === "composite-video"
}

function isSourceBaseVideo(asset: CreativeAsset) {
  return asset.variation_label === "base" && asset.generation_tool === "manual"
}

function isVideoAsset(asset: CreativeAsset) {
  const kind = `${asset.asset_type ?? ""} ${asset.gcs_path ?? ""} ${asset.signed_url ?? asset.gcs_url ?? ""}`.toLowerCase()
  return (
    kind.includes("video") ||
    kind.includes("/bases/") ||
    kind.includes("/renders/") ||
    kind.endsWith(".mp4") ||
    kind.endsWith(".mov") ||
    kind.endsWith(".webm")
  )
}
function isSignedStorageUrl(url: string) {
  return url.includes("X-Goog-Signature=") || url.includes("GoogleAccessId=")
}

function assetUrl(asset: CreativeAsset) {
  if (asset.signed_url?.trim()) return asset.signed_url
  const stored = asset.gcs_url?.trim() ?? ""
  if (stored && isSignedStorageUrl(stored)) return stored
  return ""
}

function CreativeVideoPreview({
  asset,
  resolveUrl,
  className,
  style,
  interactive = false,
}: {
  asset: CreativeAsset
  resolveUrl: (asset: CreativeAsset, media?: HTMLVideoElement) => Promise<string | null>
  className?: string
  style?: React.CSSProperties
  interactive?: boolean
}) {
  const [src, setSrc] = useState(() => assetUrl(asset))

  useEffect(() => {
    setSrc(assetUrl(asset))
  }, [asset.id, asset.signed_url, asset.gcs_url])

  useEffect(() => {
    if (src) return
    let cancelled = false
    void resolveUrl(asset).then((url) => {
      if (!cancelled && url) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [asset, resolveUrl, src])

  if (!src) {
    return (
      <div className={`flex h-full items-center justify-center text-xs text-muted-foreground ${className ?? ""}`}>
        Loading…
      </div>
    )
  }

  return (
    <video
      src={src}
      className={className}
      style={style}
      preload="metadata"
      muted
      loop={interactive}
      playsInline
      controls={!interactive}
      onLoadedMetadata={(e) => {
        e.currentTarget.currentTime = 0.1
      }}
      onMouseEnter={interactive ? (e) => void e.currentTarget.play() : undefined}
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }
          : undefined
      }
      onError={(event) => {
        void resolveUrl(asset, event.currentTarget).then((url) => {
          if (url) setSrc(url)
        })
      }}
    />
  )
}
function briefFor(asset: CreativeAsset) {
  if (Array.isArray(asset.creative_briefs)) return asset.creative_briefs[0] ?? null
  return asset.creative_briefs ?? null
}
function triggerLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    fatigue: "Fatigue",
    winner_variation: "Winner Variation",
    new_concept: "New Concept",
    manual: "Manual",
  }
  return labels[value ?? ""] ?? value ?? "Trigger"
}
function sourceLabel(value: string | null | undefined) {
  if (!value) return "manual"
  if (value === "replicate_mj") return "replicate"
  return value
}

const STATUS_COLOR: Record<string, string> = {
  success: "text-green-600", error: "text-red-500", running: "text-yellow-500",
  skipped: "text-gray-400", CRITICAL: "text-red-500", WARNING: "text-orange-500", INFO: "text-blue-500",
}
const SEVERITY_BG: Record<string, string> = {
  CRITICAL: "bg-red-50 border-red-200", WARNING: "bg-orange-50 border-orange-200", INFO: "bg-blue-50 border-blue-100",
}

const AGENT_TAB_KEYS = ["overview", "queue", "inbox", "finance", "creative"] as const
type AgentTabKey = (typeof AGENT_TAB_KEYS)[number]
function isAgentTabKey(v: string | null): v is AgentTabKey {
  return v !== null && (AGENT_TAB_KEYS as readonly string[]).includes(v)
}

export default function AgentsDashboard() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [alerts, setAlerts] = useState<OpsAlert[]>([])
  const [finance, setFinance] = useState<FinanceSnap[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [drafts, setDrafts] = useState<InboxDraft[]>([])
  const [launchAssetIds, setLaunchAssetIds] = useState<string[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState("")
  const [selectedAdsetId, setSelectedAdsetId] = useState("")
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null)
  const [editBrief, setEditBrief] = useState<StructuredBriefEditorState | null>(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Record<string, boolean>>({})
  const [viewingAsset, setViewingAsset] = useState<CreativeAsset | null>(null)
  const [photoEditPrompt, setPhotoEditPrompt] = useState("")
  const [assetEditPrompts, setAssetEditPrompts] = useState<Record<string, string>>({})
  const [launchProgress, setLaunchProgress] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<AgentTabKey>("overview")
  const {
    data: pipeline,
    error: pipelineError,
    isLoading: pipelineLoading,
    mutate: mutatePipeline,
  } = useSWR<CreativePipelineData>("/api/admin/agent/creative-pipeline", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })

  const videoJobsInFlight = useMemo(() => {
    const jobs = pipeline?.renderJobsByBrief
    if (!jobs) return false
    return Object.values(jobs)
      .flat()
      .some((job) => job.status === "pending" || job.status === "running")
  }, [pipeline?.renderJobsByBrief])

  useEffect(() => {
    if (tab !== "creative" || !videoJobsInFlight) return
    const id = setInterval(() => {
      void mutatePipeline()
    }, 5_000)
    return () => clearInterval(id)
  }, [tab, videoJobsInFlight, mutatePipeline])

  const load = useCallback(async () => {
    const sb = createClient()
    const [r1, r2, r3, r4, r5] = await Promise.all([
      sb.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(30),
      sb.from("ops_alerts").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
      sb.from("finance_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(14),
      sb
        .from("creative_queue")
        .select("*")
        .in("status", ["PENDING", "brief_ready"])
        .order("created_at", { ascending: false })
        .limit(40),
      sb.from("inbox_drafts").select("*").eq("approved", false).is("sent_at", null).order("created_at", { ascending: false }).limit(20),
    ])
    setRuns((r1.data ?? []) as AgentRun[])
    setAlerts((r2.data ?? []) as OpsAlert[])
    setFinance((r3.data ?? []) as FinanceSnap[])
    setQueue((r4.data ?? []) as QueueItem[])
    setDrafts((r5.data ?? []) as InboxDraft[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const t = searchParams.get("tab")
    if (isAgentTabKey(t)) setTab(t)
  }, [searchParams])

  const selectTab = useCallback(
    (key: AgentTabKey) => {
      setTab(key)
      router.replace(`/admin/agents?tab=${key}`, { scroll: false })
    },
    [router],
  )

  const resolveAlert = async (id: string) => {
    const sb = createClient()
    await sb.from("ops_alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id)
    setAlerts(a => a.filter(x => x.id !== id))
  }

  const approveQueueItem = async (id: string) => {
    const sb = createClient()
    await sb.from("creative_queue").update({ approved_at: new Date().toISOString(), approved_by: "dom" }).eq("id", id)
    setQueue(q => q.filter(x => x.id !== id))
  }

  const approveDraft = async (id: string) => {
    const sb = createClient()
    await sb.from("inbox_drafts").update({ approved: true, approved_at: new Date().toISOString() }).eq("id", id)
    setDrafts(d => d.filter(x => x.id !== id))
  }

  const patchPipeline = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/agent/creative-pipeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Pipeline update failed")
    return json
  }

  const formatNamerSyncMessage = (namerSync: {
    ok: boolean
    skipped?: boolean
    reason?: string
    tabTitle?: string
  }) => {
    if (namerSync.ok && !namerSync.skipped) {
      return `Added to namer${namerSync.tabTitle ? ` (${namerSync.tabTitle})` : ""}.`
    }
    if (namerSync.skipped && namerSync.reason) {
      return `Namer skipped: ${namerSync.reason}`
    }
    if (!namerSync.ok && namerSync.reason) {
      return `Namer sync failed: ${namerSync.reason}`
    }
    return ""
  }


  const generateVideoVariants = async (briefId: string) => {
    setBusyAction(`generate-video-${briefId}`)
    setPipelineMessage(null)
    try {
      const res = await fetch("/api/agent/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const hint = (json as { hint?: string }).hint
        const detail = (json as { detail?: string; error?: string }).detail
        const error = (json as { error?: string }).error ?? "Video generation failed"
        const parts = [error, detail, hint].filter(Boolean)
        throw new Error(parts.join(" — "))
      }
      await mutatePipeline()
      setPipelineMessage("Video generation started. Render jobs are queued.")
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not start video generation.")
    } finally {
      setBusyAction(null)
    }
  }

  const approveBrief = async (id: string) => {
    setBusyAction(`approve-brief-${id}`)
    setPipelineMessage(null)
    try {
      const res = await fetch("/api/agent/approve-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Brief approval failed")
      await mutatePipeline()
      setPipelineMessage("Brief approved.")
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not approve brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const rejectBrief = async (id: string) => {
    setBusyAction(`reject-brief-${id}`)
    setPipelineMessage(null)
    try {
      await patchPipeline({ action: "reject_brief", brief_id: id })
      await mutatePipeline()
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not reject brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const deleteBrief = async (brief: CreativeBrief, label?: string) => {
    const name =
      label ??
      (brief.video_config?.conceptSlug ?? brief.campaign_short_name ?? brief.hook ?? "this brief")
    if (
      !window.confirm(
        `Delete "${name}"?\n\nThis removes the brief, render jobs, and generated assets. Uploaded base MP4s in GCS are kept.`,
      )
    ) {
      return
    }

    setBusyAction(`delete-brief-${brief.id}`)
    setPipelineMessage(null)
    try {
      await patchPipeline({ action: "delete_brief", brief_id: brief.id })
      await mutatePipeline()
      setPipelineMessage(`Deleted brief "${name}".`)
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not delete brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const deleteAllApprovedVideoBriefs = async () => {
    const videoBriefs = pipeline?.approvedVideoBriefs ?? []
    if (videoBriefs.length === 0) return
    if (
      !window.confirm(
        `Delete all ${videoBriefs.length} approved video briefs?\n\nThis removes each brief and its generated assets. Uploaded base MP4s in GCS are kept.`,
      )
    ) {
      return
    }

    setBusyAction("delete-all-video-briefs")
    setPipelineMessage(null)
    try {
      for (const brief of videoBriefs) {
        await patchPipeline({ action: "delete_brief", brief_id: brief.id })
      }
      await mutatePipeline()
      setPipelineMessage(`Deleted ${videoBriefs.length} approved video briefs.`)
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not delete video briefs.")
    } finally {
      setBusyAction(null)
    }
  }

  const reviewAsset = async (id: string, action: "approve_asset" | "reject_asset") => {
    setBusyAction(`${action}-${id}`)
    setPipelineMessage(null)
    try {
      const json = await patchPipeline({ action, asset_id: id })
      await mutatePipeline()
      if (action === "approve_asset") {
        const namerSync = (json as { namer_sync?: Parameters<typeof formatNamerSyncMessage>[0] }).namer_sync
        const namerMsg = namerSync ? formatNamerSyncMessage(namerSync) : ""
        setPipelineMessage(namerMsg ? `Asset approved. ${namerMsg}` : "Asset approved.")
      }
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not update asset.")
    } finally {
      setBusyAction(null)
    }
  }

  const saveBrief = async () => {
    if (!editBrief) return
    setBusyAction(`edit-brief-${editBrief.id}`)
    setPipelineMessage(null)
    try {
      const brief = structuredEditorToPatch(editBrief)
      await patchPipeline({ action: "update_brief", brief_id: editBrief.id, brief })
      setEditBrief(null)
      await mutatePipeline()
      setPipelineMessage("Brief saved.")
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not save brief.")
    } finally {
      setBusyAction(null)
    }
  }

  const generatePreview = async (briefId: string) => {
    setBusyAction(`preview-${briefId}`)
    setPipelineMessage(null)
    try {
      const json = (await patchPipeline({ action: "generate_preview", brief_id: briefId })) as {
        preview_format?: string
      }
      await mutatePipeline()
      const fmt = json.preview_format ?? "1x1"
      setPipelineMessage(`Preview generated (1× ${fmt}). Edit via prompt if needed, then Build out sizes.`)
      setEditBrief(null)
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Preview generation failed.")
    } finally {
      setBusyAction(null)
    }
  }

  const expandStaticSizes = async (assetId: string, formats?: ("1x1" | "4x5" | "9x16")[]) => {
    setBusyAction(formats?.length === 1 ? `expand-${assetId}-${formats[0]}` : `expand-${assetId}`)
    setPipelineMessage(null)
    try {
      const json = (await patchPipeline({
        action: "expand_static_sizes",
        asset_id: assetId,
        ...(formats?.length ? { formats } : {}),
      })) as {
        generated?: number
      }
      await mutatePipeline()
      setPipelineMessage(
        json.generated
          ? `Built out ${json.generated} additional size${json.generated === 1 ? "" : "s"} from preview.`
          : "All target sizes already exist for this variation.",
      )
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not build out sizes.")
    } finally {
      setBusyAction(null)
    }
  }

  const generateVariationPreview = async (briefId: string, variationLabel: "A" | "B" | "C") => {
    setBusyAction(`variation-${briefId}-${variationLabel}`)
    setPipelineMessage(null)
    try {
      await patchPipeline({
        action: "generate_variation_preview",
        brief_id: briefId,
        variation_label: variationLabel,
      })
      await mutatePipeline()
      setPipelineMessage(`Variation ${variationLabel} preview generated. Review, edit, then build out sizes.`)
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not generate variation preview.")
    } finally {
      setBusyAction(null)
    }
  }

  const buildAllMissingSizes = async (
    brief: CreativeBrief,
    assets: CreativeAsset[],
    variationLabel = "A"
  ) => {
    const anchor =
      assets.find(
        (asset) =>
          (asset.variation_label ?? "A").toUpperCase().slice(0, 1) ===
          variationLabel.toUpperCase().slice(0, 1)
      ) ?? assets[0]
    if (!anchor) {
      setPipelineMessage("Generate a preview asset first.")
      return
    }
    const missing = missingFormatsForVariation(
      targetFormatsForBrief(brief),
      assets,
      variationLabel
    )
    if (!missing.length) {
      setPipelineMessage("All target sizes already exist for this variation.")
      return
    }
    await expandStaticSizes(anchor.id, missing)
  }

  const openPlacementBundleLaunch = (assets: CreativeAsset[]) => {
    const rows = selectPlacementBundleAssets(assets.map(toLaunchableAssetRow))
    if (rows.length < 2) {
      const err = validatePlacementBundle(assets.map(toLaunchableAssetRow))
      setPipelineMessage(
        err ??
          "Approve at least two different formats (1×1, 4×5, 9×16) for the same variation, then launch."
      )
      return
    }
    openLaunchModal(rows.map((row) => row.id))
  }

  const approveAll = async (assets: CreativeAsset[]) => {
    setBusyAction(`approve-all-${assets[0]?.brief_id ?? "unlinked"}`)
    setPipelineMessage(null)
    try {
      await Promise.all(assets.map((asset) => patchPipeline({ action: "approve_asset", asset_id: asset.id })))
      await mutatePipeline()
      setPipelineMessage("All variations approved.")
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Could not approve all assets.")
    } finally {
      setBusyAction(null)
    }
  }

  const selectedForBrief = (briefId: string) =>
    generatedAssets.filter((asset) => (asset.brief_id ?? "unlinked") === briefId && selectedAssetIds[asset.id])

  const openLaunchModal = (assetIds: string[]) => {
    setLaunchAssetIds(assetIds)
    const defaultCampaignId =
      metaCampaigns[0]?.platform_id ?? metaAdsets[0]?.platform_campaign_id ?? ""
    const adsetsForCampaign = metaAdsets.filter(
      (adset) => adset.platform_campaign_id === defaultCampaignId
    )
    setSelectedCampaignId(defaultCampaignId)
    setSelectedAdsetId(
      adsetsForCampaign[0]?.platform_id ?? metaAdsets[0]?.platform_id ?? metaAdsets[0]?.id ?? ""
    )
    setLaunchProgress(null)
  }

  const launchCreative = async () => {
    setBusyAction("launch-creative")
    setPipelineMessage(null)
    const progressTimers: number[] = []
    const clearProgressTimers = () => {
      for (const timer of progressTimers) clearTimeout(timer)
      progressTimers.length = 0
    }
    try {
      if (launchAsPlacementBundle) {
        setLaunchProgress(
          `Uploading ${launchAssetIds.length} images and creating one Meta ad with placement rules…`
        )
        const res = await fetch("/api/agent/launch-creative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetIds: launchAssetIds,
            adsetId: selectedAdsetId,
            status: "PAUSED",
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          const detail = (json as { error?: string }).error
          throw new Error(detail ?? "Launch failed")
        }
        const formats = (json as { formats?: string[] }).formats
        setLaunchProgress("Done")
        setPipelineMessage(
          formats?.length
            ? `Created 1 paused Meta ad with placements: ${formats.join(", ")}. Turn it on in Ads Manager.`
            : "Created 1 paused Meta ad with all selected sizes."
        )
      } else {
        for (const assetId of launchAssetIds) {
          const asset = generatedAssets.find((a) => a.id === assetId)
          const isVideo = asset ? isLaunchableVideo(asset) : false
          if (isVideo) {
            setLaunchProgress("Uploading video to Meta…")
            progressTimers.push(
              window.setTimeout(
                () => setLaunchProgress("Meta is processing the video (this can take 1–2 minutes)…"),
                4_000
              ),
              window.setTimeout(() => setLaunchProgress("Creating ad in Meta…"), 50_000)
            )
          } else {
            setLaunchProgress("Uploading image to Meta…")
          }
          const res = await fetch("/api/agent/launch-creative", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId, adsetId: selectedAdsetId, status: "PAUSED" }),
          })
          clearProgressTimers()
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            const detail = (json as { error?: string }).error
            throw new Error(detail ?? "Launch failed")
          }
          const warnings = (json as { preflightWarnings?: { field: string; message: string }[] })
            .preflightWarnings
          if (warnings?.length) {
            setPipelineMessage(
              `Launched. Note: ${warnings.map((w) => w.message).join(" ")}`
            )
          }
          setLaunchProgress(isVideo ? "Done" : "Launch complete")
        }
        setPipelineMessage("Creative launched to the selected Meta ad set.")
      }
      setLaunchAssetIds([])
      setSelectedCampaignId("")
      setSelectedAdsetId("")
      setSelectedAssetIds({})
      await mutatePipeline()
    } catch (err) {
      clearProgressTimers()
      setPipelineMessage(err instanceof Error ? err.message : "Could not launch creative.")
    } finally {
      clearProgressTimers()
      setLaunchProgress(null)
      setBusyAction(null)
    }
  }

  const refreshAssetUrl = useCallback(async (asset: CreativeAsset, media?: HTMLImageElement | HTMLVideoElement) => {
    if (media?.dataset.refreshing === "true" || media?.dataset.refreshed === "true") return null
    if (media) media.dataset.refreshing = "true"
    try {
      const res = await fetch("/api/admin/agent/refresh-asset-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      })
      if (!res.ok) return null
      const { gcsUrl } = (await res.json()) as { gcsUrl?: string }
      if (gcsUrl && media) {
        media.src = gcsUrl
        media.dataset.refreshed = "true"
      }
      return gcsUrl ?? null
    } finally {
      if (media) media.dataset.refreshing = "false"
    }
  }, [])

  const openAssetPreview = useCallback(async (asset: CreativeAsset) => {
    setPhotoEditPrompt(assetEditPrompts[asset.id] ?? "")
    setViewingAsset(asset)
    const gcsUrl = await refreshAssetUrl(asset)
    if (gcsUrl) {
      setViewingAsset((prev) =>
        prev?.id === asset.id ? { ...prev, signed_url: gcsUrl, gcs_url: gcsUrl } : prev
      )
    }
  }, [refreshAssetUrl, assetEditPrompts])

  const editStaticPhoto = async (
    assetId: string,
    prompt?: string,
    opts?: { closeModal?: boolean; replaceInPlace?: boolean },
  ) => {
    const editPrompt = (prompt ?? photoEditPrompt).trim()
    if (!editPrompt) {
      setPipelineMessage("Add edit instructions first (e.g. flip 180, remove blurred dumbbells).")
      return
    }
    setBusyAction(`edit-photo-${assetId}`)
    setPipelineMessage(null)
    try {
      await patchPipeline({
        action: "edit_static_photo",
        asset_id: assetId,
        edit_prompt: editPrompt,
        replace_in_place: opts?.replaceInPlace ?? true,
        save_as_new_variant: false,
      })
      await mutatePipeline()
      setPipelineMessage("Photo edited and re-composited.")
      if (opts?.closeModal) setViewingAsset(null)
    } catch (err) {
      setPipelineMessage(err instanceof Error ? err.message : "Photo edit failed.")
    } finally {
      setBusyAction(null)
    }
  }

  const criticalCount = alerts.filter(a => a.severity === "CRITICAL").length
  const latestFinance = finance[0]
  const briefs = useMemo(() => pipeline?.briefs ?? [], [pipeline?.briefs])
  const generatingBriefs = useMemo(() => pipeline?.generatingBriefs ?? [], [pipeline?.generatingBriefs])
  const approvedVideoBriefs = useMemo(
    () => pipeline?.approvedVideoBriefs ?? [],
    [pipeline?.approvedVideoBriefs]
  )
  const videoGeneratingBriefs = useMemo(
    () => pipeline?.videoGeneratingBriefs ?? [],
    [pipeline?.videoGeneratingBriefs]
  )
  const renderJobsByBrief = useMemo(
    () => pipeline?.renderJobsByBrief ?? {},
    [pipeline?.renderJobsByBrief]
  )
  const generatedAssets = useMemo(() => pipeline?.generatedAssets ?? [], [pipeline?.generatedAssets])
  const launchedAssets = useMemo(() => pipeline?.launchedAssets ?? [], [pipeline?.launchedAssets])
  const metaCampaigns = useMemo(
    () => pipeline?.activeMetaCampaigns ?? [],
    [pipeline?.activeMetaCampaigns]
  )
  const metaAdsets = useMemo(() => pipeline?.activeMetaAdsets ?? [], [pipeline?.activeMetaAdsets])
  const filteredMetaAdsets = useMemo(() => {
    if (!selectedCampaignId) return metaAdsets
    return metaAdsets.filter((adset) => adset.platform_campaign_id === selectedCampaignId)
  }, [metaAdsets, selectedCampaignId])
  const assetsByBrief = useMemo(() => {
    const grouped = new Map<string, CreativeAsset[]>()
    for (const asset of generatedAssets) {
      if (isSourceBaseVideo(asset)) continue
      const key = asset.brief_id ?? "unlinked"
      grouped.set(key, [...(grouped.get(key) ?? []), asset])
    }
    return Array.from(grouped.entries())
      .filter(([, assets]) => assets.length > 0)
      .map(([briefId, assets]) => ({
        briefId,
        brief: briefFor(assets[0]),
        assets: assets.slice(0, 6),
      }))
  }, [generatedAssets])
  const baseVideoByBrief = useMemo(() => {
    const map = new Map<string, CreativeAsset>()
    for (const asset of generatedAssets) {
      if (isSourceBaseVideo(asset) && asset.brief_id) map.set(asset.brief_id, asset)
    }
    return map
  }, [generatedAssets])
  const previewAssetCountByBrief = useMemo(() => {
    const map = new Map<string, number>()
    for (const asset of generatedAssets) {
      if (asset.brief_id) map.set(asset.brief_id, (map.get(asset.brief_id) ?? 0) + 1)
    }
    return map
  }, [generatedAssets])
  const variationReadyCount =
    generatingBriefs.length +
    videoGeneratingBriefs.length +
    approvedVideoBriefs.length +
    assetsByBrief.length
  const activeLaunchAssets = launchAssetIds
    .map((id) => generatedAssets.find((asset) => asset.id === id))
    .filter((asset): asset is CreativeAsset => Boolean(asset))

  const launchBrief = useMemo(() => {
    const asset = activeLaunchAssets[0]
    if (!asset) return null
    return briefFor(asset)
  }, [activeLaunchAssets])

  const launchCopy = useMemo(
    () => (launchBrief ? resolveBriefCopyForMeta(launchBrief) : null),
    [launchBrief]
  )

  const launchBundleRows = useMemo(
    () => activeLaunchAssets.map(toLaunchableAssetRow),
    [activeLaunchAssets]
  )

  const launchAsPlacementBundle = useMemo(
    () => canLaunchAsPlacementBundle(launchBundleRows),
    [launchBundleRows]
  )

  const placementBundleBlockReason = useMemo(() => {
    if (launchAsPlacementBundle || activeLaunchAssets.length < 2) return null
    return validatePlacementBundle(launchBundleRows)
  }, [launchAsPlacementBundle, activeLaunchAssets.length, launchBundleRows])

  const launchBundleDisabledReason = useMemo(() => {
    if (!selectedAdsetId) return "Select a target ad set."
    if (launchAsPlacementBundle) return placementBundleBlockReason
    if (activeLaunchAssets.length > 1) return placementBundleBlockReason
    return null
  }, [
    selectedAdsetId,
    launchAsPlacementBundle,
    placementBundleBlockReason,
    activeLaunchAssets.length,
  ])

  const TABS = [
    { key: "overview", label: `Overview${criticalCount > 0 ? ` 🚨${criticalCount}` : ""}` },
    { key: "queue", label: `Content Queue${queue.length > 0 ? ` (${queue.length})` : ""}` },
    { key: "inbox", label: `Inbox Drafts${drafts.length > 0 ? ` (${drafts.length})` : ""}` },
    { key: "finance", label: "Finance" },
    { key: "creative", label: `Creative Pipeline${briefs.length + variationReadyCount > 0 ? ` (${briefs.length + variationReadyCount})` : ""}` },
  ] as const

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading agent dashboard...</div>

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">thrml autonomous agent system</p>
        </div>
        <button onClick={load} className="text-sm px-3 py-1.5 border rounded-md hover:bg-muted">↻ Refresh</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Yesterday Revenue", value: latestFinance ? fmt(latestFinance.net_platform_revenue) : "—" },
          { label: "Open Alerts", value: String(alerts.length), danger: criticalCount > 0 },
          { label: "Content Pending", value: String(queue.length) },
          { label: "Inbox Drafts", value: String(drafts.length) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.danger ? "text-red-500" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => selectTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Ops Alerts */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Ops Alerts ({alerts.length})
            </h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-green-600">✅ No open alerts — all systems healthy.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => (
                  <div key={a.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${SEVERITY_BG[a.severity] ?? ""}`}>
                    <div className="flex-1 min-w-0">
                      <span className={`font-semibold text-xs ${STATUS_COLOR[a.severity]}`}>{a.severity}</span>
                      <span className="mx-2 text-muted-foreground text-xs">[{a.category}]</span>
                      <span>{a.message}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                    </div>
                    <button onClick={() => resolveAlert(a.id)}
                      className="shrink-0 text-xs px-2 py-1 border rounded hover:bg-white">
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Agent Runs */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Recent Agent Runs</h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Agent", "Status", "Duration", "Started", "Summary"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-2 font-mono text-xs">{r.agent_name}</td>
                      <td className={`px-3 py-2 font-medium text-xs ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{timeAgo(r.started_at)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">
                        {r.error_message ?? JSON.stringify(r.results ?? {}).slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* CONTENT QUEUE TAB */}
      {tab === "queue" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Social + ad content generated by agents. Review and approve to schedule.</p>
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending content.</p>
          ) : queue.map(item => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{item.queue_type}</span>
                  <span className="text-xs text-muted-foreground">{item.platform}</span>
                  {item.concept && <span className="text-xs text-muted-foreground">· {item.concept}</span>}
                  <span className="text-xs text-muted-foreground">· {timeAgo(item.created_at)}</span>
                </div>
                <button onClick={() => approveQueueItem(item.id)}
                  className="shrink-0 text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                  ✓ Approve
                </button>
              </div>
              {item.hook_suggestion && (
                <p className="text-xs font-medium text-foreground">Hook: {item.hook_suggestion}</p>
              )}
              {item.copy_suggestion && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.copy_suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* INBOX DRAFTS TAB */}
      {tab === "inbox" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Email replies drafted by the inbox agent. Approve to mark as ready to send.</p>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending inbox drafts.</p>
          ) : drafts.map(d => (
            <div key={d.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{d.subject ?? "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground">{d.from_email} · {d.category} · {timeAgo(d.created_at)}</p>
                </div>
                <button onClick={() => approveDraft(d.id)}
                  className="shrink-0 text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                  ✓ Approve
                </button>
              </div>
              {d.draft_reply && (
                <div className="bg-muted/50 rounded p-3">
                  <p className="text-xs text-muted-foreground mb-1">Draft reply:</p>
                  <p className="text-sm whitespace-pre-wrap">{d.draft_reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FINANCE TAB */}
      {tab === "finance" && (
        <div className="space-y-4">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Date", "Bookings", "Gross", "Platform Rev", "Net Rev", "New Users"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finance.map((f, i) => (
                  <tr key={f.snapshot_date} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="px-3 py-2 text-xs font-mono">{f.snapshot_date}</td>
                    <td className="px-3 py-2 text-xs">{f.booking_count}</td>
                    <td className="px-3 py-2 text-xs">{fmt(f.gross_booking_value)}</td>
                    <td className="px-3 py-2 text-xs">{fmt(f.platform_revenue)}</td>
                    <td className="px-3 py-2 text-xs font-medium">{fmt(f.net_platform_revenue)}</td>
                    <td className="px-3 py-2 text-xs">{f.new_users}</td>
                  </tr>
                ))}
                {finance.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-xs text-muted-foreground text-center">
                    No finance snapshots yet — runs after the first agent-finance cron.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATIVE PIPELINE TAB */}
      {tab === "creative" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Review agent briefs, approve generated variations, and track launched Meta creative.
            </p>
            {pipelineMessage && <p className="text-xs font-medium text-[#9A4A33]">{pipelineMessage}</p>}
          </div>
          {pipelineError ? (
            <p className="text-sm text-red-500">{pipelineError instanceof Error ? pipelineError.message : "Could not load creative pipeline."}</p>
          ) : null}

          <BriefIntakePanel
            onCreated={() => void mutatePipeline()}
            onBriefCreated={(brief) => setEditBrief(structuredEditorFromBrief(brief))}
            onMessage={setPipelineMessage}
            busyAction={busyAction}
            setBusyAction={setBusyAction}
            patchPipeline={patchPipeline}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Pending Briefs ({briefs.length})</h2>
              <div className="space-y-3">
                {pipelineLoading ? (
                  <p className="text-sm text-muted-foreground">Loading briefs...</p>
                ) : briefs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No briefs awaiting approval.</p>
                ) : briefs.map((brief) => {
                  const isPendingExpansion = brief.status === "pending"
                  const briefIsVideo = isVideoBrief(brief)
                  const canApproveBrief =
                    briefIsVideo ||
                    Boolean(brief.visual_direction?.trim()) ||
                    briefUsesSvgTemplate(brief.trigger_data) ||
                    Boolean(parseStoredStaticVariations(brief.trigger_data)?.length)

                  return (
                    <div key={brief.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono uppercase bg-muted px-2 py-0.5 rounded">
                            {triggerLabel(brief.trigger_type)}
                          </span>
                          <span className="text-[11px] font-mono uppercase bg-muted px-2 py-0.5 rounded">
                            {brief.status ?? "pending"}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{timeAgo(brief.created_at)}</span>
                      </div>

                      {isPendingExpansion ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">Brief is being expanded by agent...</p>
                            <span className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground animate-spin" aria-label="Expanding brief" />
                          </div>
                          <div className="space-y-2 animate-pulse">
                            <div className="h-3 w-2/3 rounded bg-muted" />
                            <div className="h-3 w-full rounded bg-muted" />
                            <div className="h-3 w-5/6 rounded bg-muted" />
                            <div className="h-8 rounded bg-muted" />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Hook</p>
                            <p className="text-sm font-medium">{shortText(brief.hook, 140)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Hypothesis</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{shortText(brief.hypothesis, 180)}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">Audience: {shortText(brief.target_audience, 120)}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded bg-muted px-2 py-0.5 font-mono">{brief.format ?? "format"}</span>
                            <span>{Number((brief.success_criteria?.variations as number | undefined) ?? 3)} variations</span>
                          </div>
                          {briefIsVideo ? (
                            <span className="text-[11px] font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded">video</span>
                          ) : null}
                          {!canApproveBrief ? (
                            <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                              Add a visual direction before approval so the static generator has an image prompt.
                            </p>
                          ) : null}
                          {(previewAssetCountByBrief.get(brief.id) ?? 0) > 0 ? (
                            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
                              Concept-verify preview is in Variations Ready. Edit copy here, then Approve to run the
                              full variation batch.
                            </p>
                          ) : null}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditBrief(structuredEditorFromBrief(brief))}
                              className="flex-1 text-xs px-3 py-1.5 border rounded hover:bg-muted"
                            >
                              Edit brief &amp; copy
                            </button>
                            <button
                              onClick={() => approveBrief(brief.id)}
                              disabled={!canApproveBrief || busyAction === `approve-brief-${brief.id}`}
                              className="flex-1 text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectBrief(brief.id)}
                              disabled={busyAction === `reject-brief-${brief.id}`}
                              className="flex-1 text-xs px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variations Ready ({variationReadyCount})
                </h2>
                {approvedVideoBriefs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => void deleteAllApprovedVideoBriefs()}
                    disabled={busyAction === "delete-all-video-briefs"}
                    className="text-[11px] px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Clear all video briefs ({approvedVideoBriefs.length})
                  </button>
                ) : null}
              </div>
              <div className="space-y-3">
                {pipelineLoading ? (
                  <p className="text-sm text-muted-foreground">Loading variations...</p>
                ) : variationReadyCount === 0 ? (
                  <p className="text-sm text-muted-foreground">No creative variations are ready.</p>
                ) : (
                  <>
                    {approvedVideoBriefs.map((brief) => {
                      const config = brief.video_config!
                      const variantCount = config.copyVariants?.length ?? 0
                      return (
                        <div key={brief.id} className="rounded-lg border p-3 space-y-3 border-purple-200 bg-purple-50/30">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                              <p className="text-sm font-medium">{config.conceptSlug}</p>
                              <p className="text-xs text-muted-foreground">
                                Approved · {variantCount} variant{variantCount === 1 ? "" : "s"} · source:{" "}
                                {config.source}
                                {typeof brief.trigger_data === "object" &&
                                brief.trigger_data &&
                                typeof (brief.trigger_data as Record<string, unknown>).template_id === "string"
                                  ? ` · ${(brief.trigger_data as Record<string, unknown>).template_id}`
                                  : ""}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded">approved</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setEditBrief(structuredEditorFromBrief(brief))}
                              className="text-xs px-3 py-1.5 border rounded hover:bg-muted"
                            >
                              Edit brief
                            </button>
                            <button
                              type="button"
                              onClick={() => void generateVideoVariants(brief.id)}
                              disabled={
                                busyAction === `generate-video-${brief.id}` ||
                                config.source !== "uploaded" ||
                                !config.uploadedGcsPath?.trim()
                              }
                              className="text-xs px-3 py-1.5 bg-foreground text-background rounded hover:opacity-90 disabled:opacity-50"
                            >
                              Generate Video Variants ({variantCount} copies)
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteBrief(brief, config.conceptSlug)}
                              disabled={busyAction === `delete-brief-${brief.id}`}
                              className="text-xs px-3 py-1.5 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          {config.source === "runway" ? (
                            <p className="text-xs text-amber-800">
                              Legacy Runway brief — edit brief, paste your uploaded MP4 GCS path, and save before
                              generating.
                            </p>
                          ) : !config.uploadedGcsPath?.trim() ? (
                            <p className="text-xs text-amber-800">
                              Upload base MP4 to GCS and set the path on the brief before generating.
                            </p>
                          ) : null}
                          </div>
                        </div>
                      )
                    })}
                    {videoGeneratingBriefs.map((brief) => {
                      const jobs = renderJobsByBrief[brief.id] ?? []
                      const config = brief.video_config
                      const baseAsset = baseVideoByBrief.get(brief.id)
                      const waitingForWorker = jobs.some(
                        (job) => job.status === "pending" && job.attempts === 0
                      )
                      return (
                        <div key={brief.id} className="rounded-lg border p-3 space-y-3 border-amber-200 bg-amber-50/40">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{config?.conceptSlug ?? brief.hook}</p>
                            <span className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground animate-spin" />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Compositing POV overlay onto your upload. Final variants appear here when the Railway
                            FFmpeg worker finishes.
                          </p>
                          {waitingForWorker ? (
                            <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900">
                              Queued at attempt 0 — the render worker is not running or cannot reach Supabase/GCS.
                              On Railway set <code className="font-mono">GCS_CREATIVE_BUCKET=thrml</code> and confirm
                              the worker service is deployed.
                            </p>
                          ) : null}
                          {baseAsset && assetUrl(baseAsset) ? (
                            <div className="flex items-start gap-3">
                              <div className="aspect-square w-[90px] shrink-0 overflow-hidden rounded border bg-muted">
                                <video
                                  src={assetUrl(baseAsset)}
                                  className="h-full w-full object-contain"
                                  preload="metadata"
                                  muted
                                  playsInline
                                  onLoadedMetadata={(e) => {
                                    e.currentTarget.currentTime = 0.1
                                  }}
                                  onError={(event) => {
                                    void refreshAssetUrl(baseAsset, event.currentTarget)
                                  }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Source upload registered. Waiting for composited render — do not approve this base
                                file for Meta.
                              </p>
                            </div>
                          ) : null}
                          <div className="space-y-1">
                            {jobs.map((job) => (
                              <div key={job.id} className="flex items-center justify-between text-xs gap-2">
                                <span className="font-mono">{job.variant_slug}</span>
                                <span className={`px-2 py-0.5 rounded ${jobStatusClass(job.status)}`} title={job.error_message ?? undefined}>
                                  {job.status} · attempt {job.attempts}/{job.max_attempts ?? 3}
                                </span>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteBrief(brief, config?.conceptSlug ?? brief.hook ?? undefined)}
                            disabled={busyAction === `delete-brief-${brief.id}`}
                            className="text-xs px-3 py-1.5 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete brief
                          </button>
                        </div>
                      )
                    })}
                    {generatingBriefs.map((brief) => {
                      const isActivelyGenerating = brief.status === "generating"
                      return (
                      <div key={brief.id} className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded">{brief.format ?? "format"}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {isActivelyGenerating ? "Generating variations" : "Waiting for generation"}
                            </span>
                          </div>
                          {isActivelyGenerating ? (
                            <span className="h-4 w-4 rounded-full border-2 border-muted border-t-foreground animate-spin" aria-label="Generating" />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{shortText(brief.copy_headline ?? brief.hook, 140)}</p>
                          <p className="text-xs text-muted-foreground">{shortText(brief.hypothesis, 140)}</p>
                        </div>
                        {!isActivelyGenerating ? (
                          <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                            Approval succeeded but generation did not run. Click below to generate variations.
                          </p>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-3">
                          {[0, 1, 2].map((index) => (
                            <div key={index} className="rounded-md border bg-background p-2 space-y-2 animate-pulse">
                              <div className="aspect-square rounded bg-muted" />
                              <div className="h-3 w-3/4 rounded bg-muted" />
                              <div className="h-7 rounded bg-muted" />
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditBrief(structuredEditorFromBrief(brief))}
                            className="text-xs px-3 py-1.5 border rounded hover:bg-muted"
                          >
                            Edit brief &amp; copy
                          </button>
                          {!isActivelyGenerating ? (
                            <button
                              type="button"
                              onClick={() => approveBrief(brief.id)}
                              disabled={busyAction === `approve-brief-${brief.id}`}
                              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Generate variations
                            </button>
                          ) : null}
                        </div>
                      </div>
                      )
                    })}
                    {assetsByBrief.map((group) => {
                  const selected = selectedForBrief(group.briefId)
                  const selectedApproved = selected.filter((asset) => asset.status === "approved")
                  const bundleAssets = selectPlacementBundleAssets(
                    group.assets.map(toLaunchableAssetRow)
                  )
                  const missingSizes =
                    group.brief &&
                    missingFormatsForVariation(
                      targetFormatsForBrief(group.brief),
                      group.assets,
                      group.assets[0]?.variation_label ?? "A"
                    )
                  const planLabels = group.brief
                    ? parseStoredStaticVariations(group.brief.trigger_data)?.map((row) => row.variation_label)
                    : undefined
                  const pendingVariationLabels = group.brief
                    ? nextVariationLabelsForBrief(group.brief, group.assets, planLabels)
                    : []
                  return (
                    <div key={group.briefId} className="rounded-lg border p-3 space-y-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded">{group.brief?.format ?? "format"}</span>
                          <span className="text-[11px] text-muted-foreground">{group.assets.length} generated</span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(group.assets[0].created_at)}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium">
                          {shortText(
                            group.brief
                              ? resolveBriefCopyForMeta(group.brief).copy_headline
                              : null,
                            140
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{shortText(group.brief?.hypothesis, 140)}</p>
                        {missingSizes && missingSizes.length > 0 ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Missing sizes for variation A: {missingSizes.join(", ")}. Build them before a
                            multi-placement launch.
                          </p>
                        ) : null}
                        {bundleAssets.length >= 2 ? (
                          <p className="mt-1 text-xs text-green-800">
                            Ready for one Meta ad with {bundleAssets.length} placement
                            {bundleAssets.length === 1 ? "" : "s"} (
                            {bundleAssets
                              .map((row) => row.format)
                              .filter(Boolean)
                              .join(", ")}
                            ).
                          </p>
                        ) : null}
                        {group.brief ? (
                          <button
                            type="button"
                            onClick={() => setEditBrief(structuredEditorFromBrief(group.brief!))}
                            className="mt-2 text-xs px-3 py-1.5 border rounded hover:bg-muted"
                          >
                            Edit brief &amp; copy
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {group.assets.map((asset) => {
                          const photoEditable = canEditPhotoAsset(asset) && !isVideoAsset(asset)
                          const buildOutFormats = group.brief
                            ? buildOutFormatsForAsset(group.brief, asset, group.assets)
                            : []
                          const canBuildOut = buildOutFormats.length > 0 && !isVideoAsset(asset)
                          return (
                          <CreativeAssetCard
                            key={asset.id}
                            asset={asset}
                            sourceLabel={sourceLabel(asset.generation_tool)}
                            selected={selectedAssetIds[asset.id] ?? false}
                            onSelectedChange={(checked) =>
                              setSelectedAssetIds((prev) => ({ ...prev, [asset.id]: checked }))
                            }
                            onApprove={() => reviewAsset(asset.id, "approve_asset")}
                            onReject={() => reviewAsset(asset.id, "reject_asset")}
                            onView={() => void openAssetPreview(asset)}
                            approveBusy={busyAction === `approve_asset-${asset.id}`}
                            rejectBusy={busyAction === `reject_asset-${asset.id}`}
                            canEditPhoto={photoEditable}
                            editPrompt={assetEditPrompts[asset.id] ?? ""}
                            onEditPromptChange={(value) =>
                              setAssetEditPrompts((prev) => ({ ...prev, [asset.id]: value }))
                            }
                            onApplyEdit={() =>
                              void editStaticPhoto(asset.id, assetEditPrompts[asset.id], {
                                replaceInPlace: true,
                              })
                            }
                            editBusy={busyAction === `edit-photo-${asset.id}`}
                            buildOutFormats={canBuildOut ? buildOutFormats : undefined}
                            onBuildOutSizes={
                              canBuildOut
                                ? (format) =>
                                    void expandStaticSizes(
                                      asset.id,
                                      format === "1x1" || format === "4x5" || format === "9x16"
                                        ? [format]
                                        : undefined,
                                    )
                                : undefined
                            }
                            buildOutBusy={busyAction === `expand-${asset.id}` || busyAction?.startsWith(`expand-${asset.id}-`) === true}
                            buildOutBusyFormat={
                              busyAction?.startsWith(`expand-${asset.id}-`)
                                ? busyAction.slice(`expand-${asset.id}-`.length)
                                : null
                            }
                            preview={
                              <div className={`aspect-square w-full`}>
                                {isVideoAsset(asset) ? (
                                  <CreativeVideoPreview
                                    asset={asset}
                                    resolveUrl={refreshAssetUrl}
                                    className="h-full w-full object-contain"
                                    interactive
                                  />
                                ) : assetUrl(asset) ? (
                                  <img
                                    src={assetUrl(asset)}
                                    alt="Creative asset"
                                    className="h-full w-full object-contain"
                                    onError={(event) => {
                                      void refreshAssetUrl(asset, event.currentTarget)
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-muted-foreground">
                                    No preview
                                  </div>
                                )}
                              </div>
                            }
                          />
                          )
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.brief && selectedApproved.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              const label = selectedApproved[0]?.variation_label ?? "A"
                              const ids = group.assets
                                .filter(
                                  (asset) =>
                                    asset.status === "approved" &&
                                    (asset.variation_label ?? "A") === label
                                )
                                .map((asset) => asset.id)
                              setSelectedAssetIds((prev) => ({
                                ...prev,
                                ...Object.fromEntries(ids.map((id) => [id, true])),
                              }))
                            }}
                            className="text-xs px-3 py-1.5 border rounded hover:bg-muted"
                          >
                            Select all sizes (same variation)
                          </button>
                        ) : null}
                        {pendingVariationLabels
                          .filter((label) => label !== "A")
                          .map((label) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => void generateVariationPreview(group.briefId, label)}
                              disabled={busyAction === `variation-${group.briefId}-${label}`}
                              className="text-xs px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-50"
                            >
                              New variation {label} preview
                            </button>
                          ))}
                        {group.brief && missingSizes && missingSizes.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              void buildAllMissingSizes(group.brief!, group.assets, "A")
                            }
                            disabled={
                              busyAction === `expand-${group.assets[0]?.id}` ||
                              busyAction?.startsWith(`expand-${group.assets[0]?.id}-`) === true
                            }
                            className="text-xs px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-50"
                          >
                            Build all missing sizes
                          </button>
                        ) : null}
                        <button
                          onClick={() => approveAll(group.assets)}
                          disabled={busyAction === `approve-all-${group.briefId}`}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve all
                        </button>
                        {bundleAssets.length >= 2 ? (
                          <button
                            type="button"
                            onClick={() => openPlacementBundleLaunch(group.assets)}
                            className="text-xs px-3 py-1.5 bg-[#9A4A33] text-white rounded hover:opacity-90"
                          >
                            Launch 1 ad ({bundleAssets.length} sizes)
                          </button>
                        ) : null}
                        <button
                          onClick={() => openLaunchModal(selectedApproved.map((asset) => asset.id))}
                          disabled={selectedApproved.length === 0}
                          className="text-xs px-3 py-1.5 bg-foreground text-background rounded hover:opacity-90 disabled:opacity-50"
                        >
                          Push selected to Meta
                        </button>
                      </div>
                    </div>
                  )
                    })}
                  </>
                )}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4 xl:col-span-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Launched ({launchedAssets.length})
              </h2>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Thumbnail", "Brief", "Ad Set", "Launch Date", "Spend", "CPA", "Actions"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                {launchedAssets.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-4 text-xs text-muted-foreground text-center">No launched assets yet.</td></tr>
                ) : launchedAssets.map((asset, i) => {
                  const adset = metaAdsets.find((item) => item.platform_id === asset.meta_adset_id || item.id === asset.meta_adset_id)
                  const spend = readMetric(asset.performance_data, ["spend", "amount_spent"])
                  const cpa = readMetric(asset.performance_data, ["cpa", "cost_per_action", "cost_per_purchase"])
                  const brief = briefFor(asset)
                  return (
                    <tr key={asset.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-2">
                        <div className="size-14 overflow-hidden rounded bg-muted border">
                        {assetUrl(asset) ? (
                          isVideoAsset(asset) ? (
                            <video src={assetUrl(asset)} className="h-full w-full object-contain" muted />
                          ) : (
                            <img
                              src={assetUrl(asset)}
                              alt="Launched creative"
                              className="h-full w-full object-contain"
                              onError={(event) => {
                                void refreshAssetUrl(asset, event.currentTarget)
                              }}
                            />
                          )
                        ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs max-w-xs">{shortText(brief?.copy_headline ?? brief?.hook, 80)}</td>
                      <td className="px-3 py-2 text-xs">{adset?.adset_name ?? asset.meta_adset_id ?? "Unknown ad set"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{asset.launched_at ? new Date(asset.launched_at).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-2 text-xs">{spend === null ? "—" : fmt(spend)}</td>
                      <td className="px-3 py-2 text-xs">{cpa === null ? "—" : fmt(cpa)}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex gap-1">
                          <button className="px-2 py-1 border rounded hover:bg-muted">Pause</button>
                          <button className="px-2 py-1 border rounded hover:bg-muted">Duplicate</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <CreativePipelinePurgePanel
            onPurged={() => void mutatePipeline()}
            onMessage={setPipelineMessage}
            patchPipeline={patchPipeline}
            busyAction={busyAction}
            setBusyAction={setBusyAction}
          />
        </div>
      )}

      {editBrief && (
        <BriefEditorModal
          state={editBrief}
          onChange={setEditBrief}
          onSave={() => void saveBrief()}
          onCancel={() => setEditBrief(null)}
          onGeneratePreview={() => void generatePreview(editBrief.id)}
          busy={busyAction === `edit-brief-${editBrief.id}` || busyAction === `preview-${editBrief.id}`}
                          isVideo={editBrief.is_video_brief}
        />
      )}

      {viewingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-background border shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {sourceLabel(viewingAsset.generation_tool)} · {viewingAsset.variation_label ?? `Variation ${viewingAsset.variation_index ?? "—"}`}
              </p>
              <button onClick={() => setViewingAsset(null)} className="text-sm px-3 py-1.5 border rounded hover:bg-muted">
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-hidden rounded-lg bg-muted">
              {isVideoAsset(viewingAsset) ? (
                <CreativeVideoPreview
                  asset={viewingAsset}
                  resolveUrl={refreshAssetUrl}
                  className="max-h-[75vh] w-full object-contain"
                />
              ) : assetUrl(viewingAsset) ? (
                <img
                  src={assetUrl(viewingAsset)}
                  alt="Creative asset full preview"
                  className="max-h-[75vh] w-full object-contain"
                  onError={(event) => {
                    void refreshAssetUrl(viewingAsset, event.currentTarget)
                  }}
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No preview
                </div>
              )}
            </div>
            {!isVideoAsset(viewingAsset) && canEditPhotoAsset(viewingAsset) ? (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">Edit base photo &amp; re-composite</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Edits apply to the underlying photo only (text overlay is re-applied). Examples:{" "}
                  <span className="font-mono">flip 180</span>,{" "}
                  <span className="font-mono">remove blurred dumbbells and foreground gym props</span>.
                </p>
                <textarea
                  value={photoEditPrompt}
                  onChange={(e) => {
                    setPhotoEditPrompt(e.target.value)
                    setAssetEditPrompts((prev) => ({ ...prev, [viewingAsset.id]: e.target.value }))
                  }}
                  placeholder="flip horizontal, remove blurred deck railing in foreground"
                  className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busyAction === `edit-photo-${viewingAsset.id}` || !photoEditPrompt.trim()}
                  onClick={() =>
                    void editStaticPhoto(viewingAsset.id, photoEditPrompt, {
                      closeModal: false,
                      replaceInPlace: true,
                    })
                  }
                  className="text-xs px-3 py-1.5 rounded-md bg-[#9A4A33] text-white disabled:opacity-50"
                >
                  {busyAction === `edit-photo-${viewingAsset.id}` ? "Editing…" : "Apply edit & re-composite"}
                </button>
              </div>
            ) : !isVideoAsset(viewingAsset) ? (
              <p className="text-xs text-muted-foreground rounded-lg border bg-muted/20 px-3 py-2">
                Photo prompt edits are available on AI-generated statics (Replicate/Imagen) that have a saved base photo.
                SVG template assets use the brief editor instead.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {launchAssetIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background border shadow-xl p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Launch Creative to Meta</h2>
              <p className="text-sm text-muted-foreground">
                {launchAsPlacementBundle
                  ? `Create one paused Meta ad with ${activeLaunchAssets.length} placement images (1×1, 4×5, 9×16) in the selected ad set.`
                  : `Select an active Meta ad set for ${activeLaunchAssets.length} approved asset${activeLaunchAssets.length === 1 ? "" : "s"}.`}
              </p>
              {placementBundleBlockReason ? (
                <p className="text-sm text-amber-800">{placementBundleBlockReason}</p>
              ) : null}
            </div>
            {activeLaunchAssets[0] ? (
              <div className="flex gap-3 items-start">
                {isLaunchableVideo(activeLaunchAssets[0]) ? (
                  <video
                    src={assetUrl(activeLaunchAssets[0])}
                    className="w-[90px] aspect-square rounded object-contain bg-muted shrink-0"
                    muted
                    playsInline
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={assetUrl(activeLaunchAssets[0])}
                    alt="Launch preview"
                    className="w-[90px] aspect-square rounded object-contain bg-muted shrink-0"
                  />
                )}
                <div className="space-y-1 text-xs flex-1 min-w-0">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">Meta ad name</p>
                  <p className="font-mono text-sm break-all">
                    {activeLaunchAssets[0].convention_name ?? "(legacy name — reporting may not auto-parse)"}
                  </p>
                  {!activeLaunchAssets[0].convention_name ? (
                    <p className="text-amber-700">No convention_name. Launch will use a legacy name.</p>
                  ) : null}
                  {launchBrief && launchCopy ? (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      <p><span className="text-muted-foreground">Headline:</span> {launchCopy.copy_headline}</p>
                      <p><span className="text-muted-foreground">Primary:</span> {shortText(launchCopy.copy_primary, 80)}</p>
                      <p><span className="text-muted-foreground">CTA (brief):</span> {launchCopy.cta}</p>
                      <p className="text-muted-foreground">
                        Meta shows a standard button (e.g. Sign Up / Learn More), not this exact label.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditBrief(structuredEditorFromBrief(launchBrief))}
                        className="text-xs px-2 py-1 border rounded hover:bg-muted"
                      >
                        Edit brief copy
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="space-y-2">
                <label
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="meta-campaign"
                >
                  Target campaign
                </label>
                <select
                  id="meta-campaign"
                  value={selectedCampaignId}
                  onChange={(event) => {
                    const campaignId = event.target.value
                    setSelectedCampaignId(campaignId)
                    const firstAdset = metaAdsets.find((adset) => adset.platform_campaign_id === campaignId)
                    setSelectedAdsetId(firstAdset?.platform_id ?? "")
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {metaCampaigns.length === 0 ? (
                    <option value="">No Meta campaigns available</option>
                  ) : (
                    metaCampaigns.map((campaign) => (
                      <option key={campaign.platform_id} value={campaign.platform_id}>
                        {campaign.campaign_name}
                        {campaign.status ? ` · ${campaign.status}` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-2">
                <label
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor="meta-adset"
                >
                  Target ad set
                </label>
                <select
                  id="meta-adset"
                  value={selectedAdsetId}
                  onChange={(event) => setSelectedAdsetId(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={!selectedCampaignId || filteredMetaAdsets.length === 0}
                >
                  {!selectedCampaignId || filteredMetaAdsets.length === 0 ? (
                    <option value="">
                      {!selectedCampaignId
                        ? "Select a campaign first"
                        : "No ad sets in this campaign"}
                    </option>
                  ) : (
                    filteredMetaAdsets.map((adset) => (
                      <option key={adset.id} value={adset.platform_id ?? adset.id}>
                        {adset.adset_name}
                        {adset.status ? ` · ${adset.status}` : ""}
                        {adset.market ? ` · ${adset.market}` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Lists live Meta campaigns and ad sets
                {pipeline?.metaLaunchSource === "database" ? " (database fallback — check API token)" : ""}.
                {launchAsPlacementBundle
                  ? " One ad is created with placement-specific images; turn it on in Ads Manager when ready."
                  : " Creates a PAUSED ad per asset; activate in Ads Manager when ready."}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              {activeLaunchAssets.map((asset) => (
                <p key={asset.id}>
                  {asset.variation_label ?? `Variation ${asset.variation_index ?? "—"}`} ·{" "}
                  {asset.format ?? (isLaunchableVideo(asset) ? "video" : asset.asset_type ?? "asset")}
                </p>
              ))}
            </div>
            {launchProgress && (
              <div className="rounded-md border p-3 text-xs">
                <p className="font-medium">Progress</p>
                <p className="mt-1 text-[#9A4A33]">{launchProgress}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setLaunchAssetIds([])
                  setSelectedCampaignId("")
                  setSelectedAdsetId("")
                  setLaunchProgress(null)
                }}
                className="text-sm px-3 py-1.5 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={launchCreative}
                disabled={
                  Boolean(launchBundleDisabledReason) || busyAction === "launch-creative"
                }
                title={launchBundleDisabledReason ?? undefined}
                className="text-sm px-3 py-1.5 bg-foreground text-background rounded hover:opacity-90 disabled:opacity-50"
              >
                {launchAsPlacementBundle
                  ? `Create 1 ad (${activeLaunchAssets.length} placements)`
                  : "Confirm Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
