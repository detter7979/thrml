"use client"

import { useEffect, useState } from "react"

import { Switch } from "@/components/ui/switch"

type BooleanSettingKey = "instant_book_enabled" | "new_host_signups_enabled" | "maintenance_mode"

type SettingsState = Record<BooleanSettingKey, boolean>

const DEFAULT_SETTINGS: SettingsState = {
  instant_book_enabled: true,
  new_host_signups_enabled: true,
  maintenance_mode: false,
}

type FeeMeta = {
  value: number
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
}

type PatchKey = BooleanSettingKey | "guest_fee_percent" | "host_fee_percent"

export function AdminSettingsClient() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [platformFees, setPlatformFees] = useState<{
    guest_fee_percent: FeeMeta
    host_fee_percent: FeeMeta
  } | null>(null)
  const [guestDraft, setGuestDraft] = useState("")
  const [hostDraft, setHostDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<PatchKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      const response = await fetch("/api/admin/settings")
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        settings?: Record<string, unknown>
        platformFees?: {
          guest_fee_percent: FeeMeta
          host_fee_percent: FeeMeta
        } | null
      }
      if (!mounted) return
      if (response.ok && payload.settings) {
        setSettings({
          instant_book_enabled: Boolean(payload.settings.instant_book_enabled ?? true),
          new_host_signups_enabled: Boolean(payload.settings.new_host_signups_enabled ?? true),
          maintenance_mode: Boolean(payload.settings.maintenance_mode ?? false),
        })
      } else if (!response.ok) {
        setError(payload.error ?? "Unable to load settings.")
      }
      if (payload.platformFees) {
        setPlatformFees(payload.platformFees)
        setGuestDraft(String(payload.platformFees.guest_fee_percent.value))
        setHostDraft(String(payload.platformFees.host_fee_percent.value))
      } else {
        setGuestDraft("")
        setHostDraft("")
      }
      setLoading(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  async function saveSetting(key: PatchKey, value: string | number | boolean) {
    setSavingKey(key)
    setError(null)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? "Unable to save setting.")
        return false
      }
      return true
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return <div className="px-6 py-8 text-sm text-[#6E5B49]">Loading settings...</div>
  }

  async function handleToggle(key: BooleanSettingKey, value: boolean) {
    const previous = settings
    setSettings((current) => ({ ...current, [key]: value }))
    const ok = await saveSetting(key, value)
    if (!ok) setSettings(previous)
  }

  function parseFeeDraft(raw: string) {
    return Number(raw.trim())
  }

  function isValidFee(n: number) {
    if (!Number.isFinite(n) || n < 0 || n > 20) return false
    const doubled = n * 2
    return Math.abs(doubled - Math.round(doubled)) < 1e-6
  }

  async function saveGuestFee() {
    const n = parseFeeDraft(guestDraft)
    if (!isValidFee(n)) {
      setError("Guest service fee must be between 0 and 20 in steps of 0.5.")
      return
    }
    const ok = await saveSetting("guest_fee_percent", n)
    if (ok) {
      const refreshed = await fetch("/api/admin/settings")
      const payload = (await refreshed.json().catch(() => ({}))) as {
        platformFees?: { guest_fee_percent: FeeMeta; host_fee_percent: FeeMeta } | null
      }
      if (refreshed.ok && payload.platformFees) {
        setPlatformFees(payload.platformFees)
        setGuestDraft(String(payload.platformFees.guest_fee_percent.value))
      }
    }
  }

  async function saveHostFee() {
    const n = parseFeeDraft(hostDraft)
    if (!isValidFee(n)) {
      setError("Host fee must be between 0 and 20 in steps of 0.5.")
      return
    }
    const ok = await saveSetting("host_fee_percent", n)
    if (ok) {
      const refreshed = await fetch("/api/admin/settings")
      const payload = (await refreshed.json().catch(() => ({}))) as {
        platformFees?: { guest_fee_percent: FeeMeta; host_fee_percent: FeeMeta } | null
      }
      if (refreshed.ok && payload.platformFees) {
        setPlatformFees(payload.platformFees)
        setHostDraft(String(payload.platformFees.host_fee_percent.value))
      }
    }
  }

  function formatUpdated(meta: FeeMeta) {
    if (!meta.updated_at) return "Never updated in platform_settings"
    const d = new Date(meta.updated_at)
    const when = Number.isFinite(d.getTime())
      ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : meta.updated_at
    const who = meta.updated_by_name ?? meta.updated_by ?? "Unknown"
    return `${when} · ${who}`
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <h1 className="font-serif text-3xl text-[#2A2118]">Platform settings</h1>
      <p className="text-sm text-[#6E5B49]">
        Fee changes apply to new bookings only; existing bookings keep the amounts stored on the record.
      </p>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="max-w-3xl space-y-3">
        <div className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
          <p className="text-sm font-medium text-[#2A2118]">Platform fees</p>
          <p className="mt-1 text-xs text-[#6E5B49]">
            Guest service fee is added to the space subtotal for the Stripe charge. Host fee is deducted from the
            subtotal for the Connect transfer. Values are read from Supabase on each checkout — never hardcoded.
          </p>
          {platformFees ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-[#E8DCCD] bg-white/60 p-3">
                <p className="text-xs font-medium text-[#5E4E42]">Guest service fee (%)</p>
                <p className="text-[11px] text-[#8A7968]">Shown to guests as &quot;Service fee&quot; at checkout.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={guestDraft}
                    onChange={(event) => setGuestDraft(event.target.value)}
                    className="w-28 rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-sm text-[#2A2118]"
                  />
                  <button
                    type="button"
                    disabled={savingKey === "guest_fee_percent"}
                    onClick={() => void saveGuestFee()}
                    className="rounded-full border border-[#B15538] bg-[#C75B3A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#AF4D31] disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[11px] text-[#8A7968]">{formatUpdated(platformFees.guest_fee_percent)}</p>
              </div>
              <div className="space-y-2 rounded-lg border border-[#E8DCCD] bg-white/60 p-3">
                <p className="text-xs font-medium text-[#5E4E42]">Host fee (%)</p>
                <p className="text-[11px] text-[#8A7968]">Deducted from the listing subtotal for host payout.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={hostDraft}
                    onChange={(event) => setHostDraft(event.target.value)}
                    className="w-28 rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-sm text-[#2A2118]"
                  />
                  <button
                    type="button"
                    disabled={savingKey === "host_fee_percent"}
                    onClick={() => void saveHostFee()}
                    className="rounded-full border border-[#B15538] bg-[#C75B3A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#AF4D31] disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[11px] text-[#8A7968]">{formatUpdated(platformFees.host_fee_percent)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-amber-800">
              Fee rows not found. Apply the latest Supabase migration so{" "}
              <code className="rounded bg-[#F0E6D8] px-1">guest_fee_percent</code> and{" "}
              <code className="rounded bg-[#F0E6D8] px-1">host_fee_percent</code> exist in{" "}
              <code className="rounded bg-[#F0E6D8] px-1">platform_settings</code>.
            </p>
          )}
        </div>

        {(
          [
            ["instant_book_enabled", "Instant book enabled"],
            ["new_host_signups_enabled", "New host signups enabled"],
            ["maintenance_mode", "Maintenance mode"],
          ] as Array<[BooleanSettingKey, string]>
        ).map(([key, label]) => (
          <div key={key} className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#2A2118]">{label}</p>
              <Switch
                checked={Boolean(settings[key])}
                disabled={savingKey === key}
                onCheckedChange={(checked) => void handleToggle(key, checked)}
                className="data-[state=checked]:bg-[#C75B3A]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
