"use client"

import { useEffect, useState } from "react"

import { Switch } from "@/components/ui/switch"

type SettingKey =
  | "platform_fee_percent"
  | "instant_book_enabled"
  | "new_host_signups_enabled"
  | "maintenance_mode"
type BooleanSettingKey = Exclude<SettingKey, "platform_fee_percent">

type SettingsState = Record<SettingKey, string | number | boolean>

const DEFAULT_SETTINGS: SettingsState = {
  platform_fee_percent: 12,
  instant_book_enabled: true,
  new_host_signups_enabled: true,
  maintenance_mode: false,
}

export function AdminSettingsClient() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [feeDraft, setFeeDraft] = useState<string>("12")
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      const response = await fetch("/api/admin/settings")
      const payload = (await response.json().catch(() => ({}))) as { error?: string; settings?: Record<string, unknown> }
      if (!mounted) return
      if (response.ok && payload.settings) {
        const feeValue = Number(payload.settings.platform_fee_percent ?? 12)
        setSettings({
          platform_fee_percent: feeValue,
          instant_book_enabled: Boolean(payload.settings.instant_book_enabled ?? true),
          new_host_signups_enabled: Boolean(payload.settings.new_host_signups_enabled ?? true),
          maintenance_mode: Boolean(payload.settings.maintenance_mode ?? false),
        })
        setFeeDraft(String(feeValue))
      } else {
        setError(payload.error ?? "Unable to load settings.")
      }
      setLoading(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  async function saveSetting(key: SettingKey, value: string | number | boolean) {
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

  async function handleFeeSave() {
    const parsed = Number(feeDraft)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError("Platform fee must be a number between 0 and 100.")
      return
    }

    const ok = await saveSetting("platform_fee_percent", parsed)
    if (ok) {
      setSettings((current) => ({ ...current, platform_fee_percent: parsed }))
    }
  }

  return (
    <div className="space-y-4 px-6 py-8">
      <h1 className="font-serif text-3xl text-[#2A2118]">Platform settings</h1>
      <p className="text-sm text-[#6E5B49]">Set platform fee manually and toggle the other platform controls.</p>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="max-w-3xl space-y-3">
        <div className="rounded-xl border border-[#D9CBB8] bg-[#FCF8F3] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#2A2118]">Standard platform fee</p>
              <p className="text-xs text-[#6E5B49]">
                Optional admin-set percentage (currently {String(settings.platform_fee_percent)}%).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={feeDraft}
                onChange={(event) => setFeeDraft(event.target.value)}
                className="w-24 rounded-lg border border-[#D9CBB8] bg-white px-2 py-1 text-sm text-[#2A2118]"
              />
              <button
                type="button"
                disabled={savingKey === "platform_fee_percent"}
                onClick={() => void handleFeeSave()}
                className="rounded-full border border-[#B15538] bg-[#C75B3A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#AF4D31] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
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
