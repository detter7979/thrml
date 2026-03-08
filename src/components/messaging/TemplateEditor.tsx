"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type TemplateType =
  | "booking_confirmed"
  | "pre_arrival"
  | "check_in"
  | "access_instructions"
  | "check_out"

type TemplateItem = {
  id: string | null
  host_id: string
  template_type: TemplateType
  content: string
  is_automated: boolean
  send_hours_before: number | null
  access_type: string | null
  access_details: Record<string, unknown> | null
  description: string
  label: string
}

const VARIABLES = [
  "{guest_name}",
  "{listing_title}",
  "{date}",
  "{time}",
  "{duration}",
  "{access_code}",
  "{host_name}",
  "{address}",
]

const ICONS: Record<TemplateType, string> = {
  booking_confirmed: "🎉",
  pre_arrival: "📅",
  check_in: "⏰",
  access_instructions: "🔐",
  check_out: "✅",
}

export function TemplateEditor() {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [expanded, setExpanded] = useState<TemplateType | null>(null)
  const [savingType, setSavingType] = useState<TemplateType | null>(null)
  const [loading, setLoading] = useState(true)
  const textareasRef = useRef<Record<string, HTMLTextAreaElement | null>>({})

  async function load() {
    setLoading(true)
    try {
      const response = await fetch("/api/messages/templates")
      if (!response.ok) return
      const payload = (await response.json()) as { templates: TemplateItem[] }
      setTemplates(payload.templates ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const byType = useMemo(
    () =>
      templates.reduce<Record<TemplateType, TemplateItem | undefined>>((acc, item) => {
        acc[item.template_type] = item
        return acc
      }, {} as Record<TemplateType, TemplateItem | undefined>),
    [templates]
  )

  function updateTemplate(type: TemplateType, updater: (current: TemplateItem) => TemplateItem) {
    setTemplates((prev) =>
      prev.map((item) => (item.template_type === type ? updater(item) : item))
    )
  }

  async function saveTemplate(item: TemplateItem) {
    setSavingType(item.template_type)
    try {
      const response = await fetch("/api/messages/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_type: item.template_type,
          content: item.content,
          is_automated: item.is_automated,
          send_hours_before: item.send_hours_before,
          access_type: item.access_type,
          access_details: item.access_details,
        }),
      })
      if (!response.ok) return
      const payload = (await response.json()) as { template: TemplateItem }
      updateTemplate(item.template_type, (current) => ({ ...current, ...payload.template }))
    } finally {
      setSavingType(null)
    }
  }

  if (loading) {
    return <div className="px-4 py-8 text-sm text-[#7A6A5D]">Loading templates...</div>
  }

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      <header>
        <h1 className="font-serif text-4xl text-[#1A1410]">Host Message Templates</h1>
        <p className="mt-1 text-sm text-[#7A6A5D]">
          Configure the messages guests receive during the booking lifecycle.
        </p>
      </header>

      {templates.map((template) => {
        const open = expanded === template.template_type
        return (
          <Card key={template.template_type} className="border-[#E5DCCF]">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg text-[#1A1410]">
                    {ICONS[template.template_type]} {template.label}
                  </CardTitle>
                  <p className="mt-1 text-sm text-[#7A6A5D]">{template.description}</p>
                  <p className="mt-2 text-sm text-[#5A4B40] line-clamp-1">&quot;{template.content}&quot;</p>
                  <p className="mt-2 text-xs text-[#7E6F63]">
                    Auto-send: {template.is_automated ? "ON ●" : "OFF ○"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setExpanded((current) =>
                      current === template.template_type ? null : template.template_type
                    )
                  }
                >
                  {open ? "Close" : "Edit"}
                </Button>
              </div>
            </CardHeader>
            {open ? (
              <CardContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Template copy</Label>
                  <textarea
                    ref={(node) => {
                      textareasRef.current[template.template_type] = node
                    }}
                    value={byType[template.template_type]?.content ?? ""}
                    onChange={(event) =>
                      updateTemplate(template.template_type, (current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                    rows={5}
                    className="w-full rounded-md border border-[#E5DCCF] bg-white px-3 py-2 text-sm outline-none focus:border-[#C75B3A]"
                  />
                  <div className="flex flex-wrap gap-2">
                    {VARIABLES.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => {
                          const textarea = textareasRef.current[template.template_type]
                          if (!textarea) {
                            updateTemplate(template.template_type, (current) => ({
                              ...current,
                              content: `${current.content}${current.content ? " " : ""}${variable}`,
                            }))
                            return
                          }
                          const current = byType[template.template_type]
                          if (!current) return
                          const start = textarea.selectionStart ?? current.content.length
                          const end = textarea.selectionEnd ?? current.content.length
                          const next =
                            current.content.slice(0, start) + variable + current.content.slice(end)
                          updateTemplate(template.template_type, (row) => ({
                            ...row,
                            content: next,
                          }))
                          requestAnimationFrame(() => {
                            textarea.focus()
                            const nextPosition = start + variable.length
                            textarea.setSelectionRange(nextPosition, nextPosition)
                          })
                        }}
                        className="rounded-full border border-[#E5DCCF] px-2 py-1 text-xs text-[#6D5D51] hover:bg-[#FFF5ED]"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[#E9E0D5] bg-[#FCF8F4] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-[#1A1410]">Auto-send</p>
                    <p className="text-xs text-[#7A6A5D]">
                      OFF templates are still available for manual quick replies.
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(byType[template.template_type]?.is_automated)}
                    onCheckedChange={(checked) =>
                      updateTemplate(template.template_type, (current) => ({
                        ...current,
                        is_automated: checked,
                      }))
                    }
                  />
                </div>

                {(template.template_type === "check_in" || template.template_type === "access_instructions") ? (
                  <div className="space-y-3 rounded-lg border border-[#E9E0D5] p-3">
                    <p className="text-sm font-medium text-[#1A1410]">How do guests access your space?</p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {["virtual_code", "lockbox", "onsite", "key_exchange"].map((option) => (
                        <label key={option} className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`access-${template.template_type}`}
                            checked={(byType[template.template_type]?.access_type ?? "virtual_code") === option}
                            onChange={() =>
                              updateTemplate(template.template_type, (current) => ({
                                ...current,
                                access_type: option,
                              }))
                            }
                          />
                          {option === "virtual_code"
                            ? "Virtual code"
                            : option === "lockbox"
                              ? "Lockbox"
                              : option === "onsite"
                                ? "Someone on-site"
                                : "Key exchange"}
                        </label>
                      ))}
                    </div>

                    {(byType[template.template_type]?.access_type ?? "virtual_code") === "virtual_code" ? (
                      <div className="rounded-md bg-[#F5F1EC] p-2 text-xs text-[#6F6054]">
                        Access code is generated automatically per booking and inserted via {"{access_code}"}.
                        <div className="mt-1">Preview: Your access code is: 4821</div>
                      </div>
                    ) : null}

                    {(byType[template.template_type]?.access_type ?? "virtual_code") === "lockbox" ? (
                      <div className="space-y-1">
                        <Label>Lockbox location and combination</Label>
                        <Input
                          value={String(byType[template.template_type]?.access_details?.lockbox ?? "")}
                          onChange={(event) =>
                            updateTemplate(template.template_type, (current) => ({
                              ...current,
                              access_details: {
                                ...(current.access_details ?? {}),
                                lockbox: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ) : null}

                    {(byType[template.template_type]?.access_type ?? "virtual_code") === "onsite" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>On-site contact name</Label>
                          <Input
                            value={String(byType[template.template_type]?.access_details?.onsite_name ?? "")}
                            onChange={(event) =>
                              updateTemplate(template.template_type, (current) => ({
                                ...current,
                                access_details: {
                                  ...(current.access_details ?? {}),
                                  onsite_name: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>On-site contact phone</Label>
                          <Input
                            value={String(byType[template.template_type]?.access_details?.onsite_phone ?? "")}
                            onChange={(event) =>
                              updateTemplate(template.template_type, (current) => ({
                                ...current,
                                access_details: {
                                  ...(current.access_details ?? {}),
                                  onsite_phone: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {(byType[template.template_type]?.access_type ?? "virtual_code") === "key_exchange" ? (
                      <div className="space-y-1">
                        <Label>Key exchange instructions</Label>
                        <Input
                          value={String(byType[template.template_type]?.access_details?.key_exchange ?? "")}
                          onChange={(event) =>
                            updateTemplate(template.template_type, (current) => ({
                              ...current,
                              access_details: {
                                ...(current.access_details ?? {}),
                                key_exchange: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    className="bg-[#C75B3A] text-white hover:bg-[#B44D31]"
                    disabled={savingType === template.template_type}
                    onClick={() => void saveTemplate(byType[template.template_type] ?? template)}
                  >
                    {savingType === template.template_type ? "Saving..." : "Save template"}
                  </Button>
                </div>
              </CardContent>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
