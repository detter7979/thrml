export const ACCESS_TYPES = {
  code: {
    label: "Entry code",
    description: "A PIN or door code guests enter to access the space",
    icon: "KeyRound",
    supportsAutoSend: true,
    supportsCode: true,
  },
  lockbox: {
    label: "Lockbox",
    description: "A physical lockbox with a combination guests use to retrieve a key",
    icon: "Lock",
    supportsAutoSend: true,
    supportsCode: true,
  },
  keypick: {
    label: "Key handoff",
    description: "You or a designated person will hand the key to the guest directly",
    icon: "Handshake",
    supportsAutoSend: false,
    supportsCode: false,
  },
  smart_lock: {
    label: "Smart lock",
    description: "August, Schlage, Yale or similar - unique code per booking",
    icon: "Smartphone",
    supportsAutoSend: true,
    supportsCode: true,
    comingSoon: true,
  },
  host_present: {
    label: "Host present",
    description: "You will be on-site to let guests in",
    icon: "User",
    supportsAutoSend: false,
    supportsCode: false,
  },
} as const

export const CODE_SEND_TIMING = {
  on_confirm: "Immediately when booking confirms",
  "24h_before": "24 hours before session",
  "1h_before": "1 hour before session",
} as const

export const INSTRUCTION_VARIABLES = [
  { variable: "[CODE]", description: "The access code or lockbox combo" },
  { variable: "[DATE]", description: "Session date (e.g. March 9, 2026)" },
  { variable: "[TIME]", description: "Session start time (e.g. 2:00 PM)" },
  { variable: "[GUEST_NAME]", description: "Guest first name" },
  { variable: "[DURATION]", description: "Session length (e.g. 60 minutes)" },
] as const

export type AccessTypeKey = keyof typeof ACCESS_TYPES
export type CodeSendTimingKey = keyof typeof CODE_SEND_TIMING

export function resolveInstructions(
  template: string,
  values: {
    code?: string | null
    date?: string
    time?: string
    guestName?: string
    duration?: string
  }
): string {
  return template
    .replace(/\[CODE\]/g, values.code ?? "")
    .replace(/\[DATE\]/g, values.date ?? "")
    .replace(/\[TIME\]/g, values.time ?? "")
    .replace(/\[GUEST_NAME\]/g, values.guestName ?? "")
    .replace(/\[DURATION\]/g, values.duration ?? "")
}

