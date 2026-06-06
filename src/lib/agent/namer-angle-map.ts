import type { AngleT } from "@/types/paid-media"

/** Pipeline / folder slugs that map to Postgres angle_t values. */
const ANGLE_ALIASES: Record<string, AngleT> = {
  pov_earnings: "income",
  "pov-earnings": "income",
  earnings: "income",
  idle: "idle_space",
  socialproof: "social_proof",
}

export function normalizeAngleForDb(raw: string): AngleT {
  const key = raw.trim().toLowerCase().replace(/-/g, "_")
  const aliased = ANGLE_ALIASES[key]
  if (aliased) return aliased

  const allowed: AngleT[] = [
    "income",
    "community",
    "idle_space",
    "thermal",
    "social_proof",
    "urgency",
    "sensory",
    "ease",
  ]
  if (allowed.includes(key as AngleT)) return key as AngleT

  return "income"
}
