export function splitFullName(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return { firstName: "", lastName: "" }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { firstName: first ?? "", lastName: rest.join(" ") }
}

export function buildFullName(firstName?: string | null, lastName?: string | null) {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ")
}
