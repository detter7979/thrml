export const DEFAULT_HOUSE_RULES: string[] = [
  "Shower before entering the space",
  "No food or drink inside the space",
  "Respect your session time - please exit promptly when your session ends",
  "No additional guests beyond your booking",
  "Leave the space as you found it",
  "No smoking or vaping on the property",
  "Keep noise to a minimum - be respectful of neighbors",
  "Report any damage or issues to the host immediately",
]

export function resolveHouseRules(
  houseRules?: string[] | null,
  houseRulesCustom?: string | null
): {
  rules: string[]
  custom: string | null
  isDefault: boolean
} {
  const normalizedRules = Array.isArray(houseRules)
    ? houseRules
        .map((rule) => (typeof rule === "string" ? rule.trim() : ""))
        .filter((rule) => rule.length > 0)
    : []
  const hasRules = normalizedRules.length > 0
  const trimmedCustom = typeof houseRulesCustom === "string" ? houseRulesCustom.trim() : ""
  const hasCustom = trimmedCustom.length > 0

  return {
    rules: hasRules ? normalizedRules : DEFAULT_HOUSE_RULES,
    custom: hasCustom ? trimmedCustom : null,
    isDefault: !hasRules,
  }
}
