"use client"

import { useState } from "react"
import useSWR from "swr"

import {
  SOCIAL_PILLARS,
  SOCIAL_PLATFORMS,
  todaysPillar,
  type SocialPillar,
  type SocialPlatformKey,
  type SocialTriggerData,
} from "@/lib/agent/social-constants"

type SocialPost = {
  id: string
  status: string
  hook: string | null
  format: string | null
  visual_direction: string | null
  copy_primary: string | null
  cta: string | null
  trigger_data: Partial<SocialTriggerData> | null
  created_at: string
  approved_at: string | null
  rejected_at: string | null
  published_at: string | null
  created_by: string | null
}

type SocialPostsResponse = { drafts: SocialPost[]; approved: SocialPost[]; history: SocialPost[] }

const PILLAR_LABEL: Record<SocialPillar, string> = {
  education: "Education",
  social_proof: "Social proof",
  host_spotlight: "Host spotlight",
  offer_cta: "Offer / CTA",
}

const PLATFORM_LABEL: Record<SocialPlatformKey, string> = {
  instagram_reel: "IG Reel",
  tiktok_reel: "TikTok",
  twitter_thread: "X thread",
  instagram_static: "IG static",
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Request failed")
  return json as SocialPostsResponse
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`
}

export function SocialPostsPanel() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/agent/social-posts", fetcher)
  const [pillar, setPillar] = useState<SocialPillar>(todaysPillar())
  const [platforms, setPlatforms] = useState<SocialPlatformKey[]>(SOCIAL_PLATFORMS.map((p) => p.key))
  const [direction, setDirection] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})

  const togglePlatform = (key: SocialPlatformKey) =>
    setPlatforms((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))

  const generate = async () => {
    if (platforms.length === 0) return setMessage("Pick at least one platform.")
    setBusy("generate")
    setMessage(`Writing ${platforms.length} post${platforms.length > 1 ? "s" : ""}… this takes about 10 seconds each.`)
    try {
      const res = await fetch("/api/admin/agent/social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pillar, platforms, direction: direction.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok && !json.created) throw new Error(json.error ?? "Generation failed")
      const failed = (json.failed ?? []) as { platform: string }[]
      setMessage(
        `Created ${json.created?.length ?? 0} draft${json.created?.length === 1 ? "" : "s"}` +
          (failed.length ? `; ${failed.length} failed (${failed.map((f) => f.platform).join(", ")}).` : ".")
      )
      await mutate()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setBusy(null)
    }
  }

  const review = async (post: SocialPost, action: "approve" | "reject" | "reopen") => {
    setBusy(`${action}:${post.id}`)
    try {
      const caption = editing[post.id]
      const res = await fetch("/api/admin/agent/social-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, action, ...(caption != null ? { caption } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Update failed")
      setEditing((cur) => {
        const next = { ...cur }
        delete next[post.id]
        return next
      })
      await mutate()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusy(null)
    }
  }

  const renderPost = (post: SocialPost, mode: "draft" | "approved" | "history") => {
    const td = post.trigger_data ?? {}
    const platform = (td.platform ?? "") as SocialPlatformKey
    const caption = editing[post.id] ?? post.copy_primary ?? ""
    return (
      <div key={post.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase bg-muted px-2 py-0.5 rounded">
              {PLATFORM_LABEL[platform] ?? platform ?? "post"}
            </span>
            {td.pillar ? (
              <span className="text-[11px] font-mono uppercase bg-muted px-2 py-0.5 rounded">
                {PILLAR_LABEL[td.pillar as SocialPillar] ?? td.pillar}
              </span>
            ) : null}
            {mode === "history" ? (
              <span className="text-[11px] font-mono uppercase bg-muted px-2 py-0.5 rounded">{post.status}</span>
            ) : null}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {post.created_by === "admin" ? "you" : "agent"} · {ago(post.created_at)}
          </span>
        </div>
        {post.hook ? <p className="text-sm font-medium">{post.hook}</p> : null}
        {mode === "draft" ? (
          <textarea
            className="w-full min-h-[120px] rounded-md border bg-background p-2 text-sm"
            value={caption}
            onChange={(e) => setEditing((cur) => ({ ...cur, [post.id]: e.target.value }))}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{caption}</p>
        )}
        {td.hashtags?.length ? (
          <p className="text-xs text-muted-foreground">{td.hashtags.map((t) => `#${t}`).join(" ")}</p>
        ) : null}
        {post.visual_direction ? (
          <p className="text-xs">
            <span className="font-medium">Visual:</span> {post.visual_direction}
          </p>
        ) : null}
        {mode !== "history" ? (
          <div className="flex gap-2 pt-1">
            {mode === "draft" ? (
              <>
                <button
                  className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void review(post, "approve")}
                >
                  {editing[post.id] != null ? "Save & approve" : "Approve"}
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-md border disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void review(post, "reject")}
                >
                  Reject
                </button>
              </>
            ) : (
              <button
                className="text-xs px-3 py-1.5 rounded-md border disabled:opacity-50"
                disabled={busy !== null}
                onClick={() => void review(post, "reopen")}
              >
                Move back to drafts
              </button>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Social posts</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Organic posts drafted nightly by the social agent, or on demand here. Approved posts go to the publish queue.
          </p>
        </div>
        {message ? <p className="text-xs font-medium text-[#9A4A33]">{message}</p> : null}
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium" htmlFor="social-pillar">Pillar</label>
          <select
            id="social-pillar"
            className="text-sm rounded-md border bg-background px-2 py-1"
            value={pillar}
            onChange={(e) => setPillar(e.target.value as SocialPillar)}
          >
            {SOCIAL_PILLARS.map((p) => (
              <option key={p} value={p}>{PILLAR_LABEL[p]}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {SOCIAL_PLATFORMS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => togglePlatform(p.key)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  platforms.includes(p.key) ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {PLATFORM_LABEL[p.key]}
              </button>
            ))}
          </div>
        </div>
        <input
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          placeholder="Optional direction, e.g. mention the new Pinehurst cedar sauna"
          value={direction}
          maxLength={500}
          onChange={(e) => setDirection(e.target.value)}
        />
        <button
          className="text-sm px-3 py-1.5 rounded-md bg-foreground text-background disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => void generate()}
        >
          {busy === "generate" ? "Generating…" : "Generate posts"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-500">{error.message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading posts…</p> : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Drafts ({data.drafts.length})
            </h3>
            {data.drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts. Generate some above.</p>
            ) : (
              data.drafts.map((p) => renderPost(p, "draft"))
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ready to publish ({data.approved.length})
            </h3>
            {data.approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing approved yet.</p>
            ) : (
              data.approved.map((p) => renderPost(p, "approved"))
            )}
            {data.history.length ? (
              <details className="pt-2">
                <summary className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
                  Published &amp; rejected ({data.history.length})
                </summary>
                <div className="space-y-3 pt-3">{data.history.map((p) => renderPost(p, "history"))}</div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
