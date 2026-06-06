import {
  THRML_LEGACY_ID_PATTERN,
  type NamerTabKind,
} from "@/lib/agent/namer-sheet-schema"

export type ThrmlEntityKind = NamerTabKind

const PAD = 3

export function formatThrmlLegacyId(kind: ThrmlEntityKind, sequence: number): string {
  const n = Math.max(1, Math.floor(sequence))
  const padded = String(n).padStart(PAD, "0")
  if (kind === "campaign") return `C${padded}`
  if (kind === "ad_set") return `AS${padded}`
  return `AD${padded}`
}

export function parseThrmlLegacySequence(value: string, kind: ThrmlEntityKind): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = THRML_LEGACY_ID_PATTERN[kind].exec(trimmed)
  if (!match?.[1]) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

export function collectThrmlLegacyIds(
  values: Iterable<string>,
  kind: ThrmlEntityKind
): string[] {
  const out: string[] = []
  for (const raw of values) {
    const seq = parseThrmlLegacySequence(raw, kind)
    if (seq != null) out.push(formatThrmlLegacyId(kind, seq))
  }
  return out
}

export function maxThrmlLegacySequence(values: Iterable<string>, kind: ThrmlEntityKind): number {
  let max = 0
  for (const raw of values) {
    const seq = parseThrmlLegacySequence(raw, kind)
    if (seq != null && seq > max) max = seq
  }
  return max
}

export function allocateNextThrmlLegacyId(
  existingValues: Iterable<string>,
  kind: ThrmlEntityKind
): string {
  return formatThrmlLegacyId(kind, maxThrmlLegacySequence(existingValues, kind) + 1)
}
