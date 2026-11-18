import { z } from "zod"

/**
 * Host applications (founding-host phase). One question splits the funnel:
 *  - owns a sauna today → review queue (status "new"), founding/waitlist decisions in /admin
 *  - planning / exploring → "future" list (no review), kept for later rounds and installer partners
 */

export const OWNS_SAUNA = ["yes", "planning", "exploring"] as const
export type OwnsSauna = (typeof OWNS_SAUNA)[number]

export const APPLICATION_STATUSES = [
  "new",
  "shortlisted",
  "founding",
  "waitlisted",
  "declined",
  "converted",
  "future",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/\s+/g, " "))
    .optional()
    .transform((v) => (v && v.length ? v : null))

const baseFields = {
  email: z.string().trim().toLowerCase().email().max(200),
  full_name: shortText(120),
  neighborhood: shortText(120),
  website: z.string().optional(), // honeypot
  signup_path: shortText(120),
  utm_source: shortText(60),
  utm_campaign: shortText(120),
}

/** Owners answer the full questionnaire; everyone else just leaves an email (+ neighborhood). */
export const hostApplicationSchema = z.discriminatedUnion("owns_sauna", [
  z.object({
    owns_sauna: z.literal("yes"),
    ...baseFields,
    full_name: z.string().trim().min(1, "Please add your name").max(120),
    neighborhood: z.string().trim().min(2, "Where is the sauna?").max(120),
    phone: shortText(40),
    sauna_type: z.string().trim().min(1, "What kind of sauna is it?").max(120),
    private_access: z.enum(["yes", "partly", "no"]),
    availability: z.enum(["1-2", "3-4", "5+"]),
    notes: shortText(1000),
  }),
  z.object({ owns_sauna: z.literal("planning"), ...baseFields }),
  z.object({ owns_sauna: z.literal("exploring"), ...baseFields }),
])

export type HostApplicationInput = z.infer<typeof hostApplicationSchema>

/** Initial review status for a new application. */
export function initialApplicationStatus(owns: OwnsSauna): ApplicationStatus {
  return owns === "yes" ? "new" : "future"
}

/**
 * Row to upsert. Re-applying with the same email updates the answers but never moves someone
 * backwards out of a decision you already made (e.g. founding → new).
 */
export function applicationRow(
  input: HostApplicationInput,
  existingStatus: ApplicationStatus | null,
  userId: string | null
): Record<string, unknown> {
  const owner = input.owns_sauna === "yes"
  const fresh = initialApplicationStatus(input.owns_sauna)
  // Keep a decided status; only promote a "future" lead into review once they own a sauna.
  const status =
    existingStatus && existingStatus !== "future" ? existingStatus : fresh

  return {
    email: input.email,
    full_name: input.full_name ?? null,
    neighborhood: input.neighborhood ?? null,
    owns_sauna: input.owns_sauna,
    phone: owner ? input.phone ?? null : null,
    sauna_type: owner ? input.sauna_type : null,
    private_access: owner ? input.private_access : null,
    availability: owner ? input.availability : null,
    notes: owner ? input.notes ?? null : null,
    status,
    user_id: userId,
    signup_path: input.signup_path ?? null,
    utm_source: input.utm_source ?? null,
    utm_campaign: input.utm_campaign ?? null,
    updated_at: new Date().toISOString(),
  }
}

export const PRIVATE_ACCESS_LABEL: Record<string, string> = {
  yes: "Separate / private for guests",
  partly: "Shared entry, private sauna",
  no: "Through the main house",
}

export const AVAILABILITY_LABEL: Record<string, string> = {
  "1-2": "1–2 days a week",
  "3-4": "3–4 days a week",
  "5+": "5+ days a week",
}

export const OWNS_SAUNA_LABEL: Record<OwnsSauna, string> = {
  yes: "Has a sauna",
  planning: "Planning to get one",
  exploring: "Just exploring",
}
