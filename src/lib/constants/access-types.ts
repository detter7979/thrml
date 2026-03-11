export const ACCESS_TYPES = {
  code: {
    label: "Keypad / Smart Lock",
    description: "Guest enters a code on a keypad or digital lock.",
    icon: "KeyRound",
    supportsAutoSend: true,
    supportsCode: true,
  },
  lockbox: {
    label: "Lockbox",
    description: "Guest uses a code to open a lockbox and retrieve the key.",
    icon: "Lock",
    supportsAutoSend: true,
    supportsCode: true,
  },
  host_onsite: {
    label: "I'll be on-site",
    description: "You'll greet the guest and let them in yourself.",
    icon: "Handshake",
    supportsAutoSend: false,
    supportsCode: false,
  },
  other: {
    label: "Other",
    description: "Describe your entry method in the instructions below.",
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

